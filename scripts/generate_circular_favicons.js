const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateFavicons() {
  const sourcePath = path.join(__dirname, '..', 'public', 'images', 'AVA GIEO MƠ.png');
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Source image not found: ' + sourcePath);
  }

  const masterSize = 1024;
  const radius = masterSize / 2;

  // 1. Create a high-precision circular mask with anti-aliasing
  // Circle mask with radius 508 (leaves 4px padding so no clipping occurs)
  const circleMaskSvg = Buffer.from(
    `<svg width="${masterSize}" height="${masterSize}" viewBox="0 0 ${masterSize} ${masterSize}">
       <circle cx="${radius}" cy="${radius}" r="${radius - 4}" fill="#ffffff" />
     </svg>`
  );

  // 2. Elegant warm brand ring border (#FFB98A)
  // Subtle stroke that outlines the circular badge
  const ringSvg = Buffer.from(
    `<svg width="${masterSize}" height="${masterSize}" viewBox="0 0 ${masterSize} ${masterSize}">
       <circle cx="${radius}" cy="${radius}" r="${radius - 12}" fill="none" stroke="#FFB98A" stroke-width="16" />
     </svg>`
  );

  console.log('Generating 1024x1024 circular master image...');
  const masterBuffer = await sharp(sourcePath)
    .resize(masterSize, masterSize, { fit: 'cover', position: 'center' })
    .composite([
      { input: circleMaskSvg, blend: 'dest-in' },
      { input: ringSvg, blend: 'over' }
    ])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // Targets to write:
  const sizes = [
    { size: 512, dests: ['public/icon-512.png'] },
    { size: 192, dests: ['public/icon-192.png', 'public/icon.png', 'src/app/icon.png'] },
    { size: 180, dests: ['public/apple-icon.png', 'public/apple-touch-icon.png', 'src/app/apple-icon.png'] },
    { size: 48, dests: ['public/icon-48.png'] }
  ];

  for (const { size, dests } of sizes) {
    const resized = await sharp(masterBuffer)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ quality: 100 })
      .toBuffer();

    for (const relDest of dests) {
      const fullDest = path.join(__dirname, '..', relDest);
      fs.writeFileSync(fullDest, resized);
      console.log(`✓ Generated ${relDest} (${size}x${size})`);
    }
  }

  // Generate ICO with 16x16, 32x32, 48x48
  console.log('Generating multi-resolution favicon.ico (16, 32, 48)...');
  const png16 = await sharp(masterBuffer).resize(16, 16, { kernel: 'lanczos3' }).png().toBuffer();
  const png32 = await sharp(masterBuffer).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer();
  const png48 = await sharp(masterBuffer).resize(48, 48, { kernel: 'lanczos3' }).png().toBuffer();

  const icoBuffer = createIcoFromPngs([
    { size: 16, buffer: png16 },
    { size: 32, buffer: png32 },
    { size: 48, buffer: png48 }
  ]);

  fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'app', 'favicon.ico'), icoBuffer);
  console.log('✓ Generated public/favicon.ico and src/app/favicon.ico');

  // Also create a high-quality SVG favicon embedding the circular artwork
  const base64Png = masterBuffer.toString('base64');
  const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <clipPath id="circleView">
      <circle cx="256" cy="256" r="252" />
    </clipPath>
  </defs>
  <image href="data:image/png;base64,${base64Png}" width="512" height="512" clip-path="url(#circleView)" />
</svg>`;

  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.svg'), svgFavicon);
  console.log('✓ Generated public/icon.svg');

  console.log('\n🎉 ALL CIRCULAR FAVICONS SUCCESSFULLY GENERATED FOR GOOGLE SEARCH CONSOLE & BROWSERS!');
}

function createIcoFromPngs(images) {
  // ICO header: 6 bytes
  // Reserved (2 bytes) = 0
  // Type (2 bytes) = 1 (Icon)
  // Count (2 bytes) = images.length
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  const totalDirSize = headerSize + dirEntrySize * numImages;

  let currentOffset = totalDirSize;
  const dirEntries = [];

  for (const img of images) {
    const size = img.size;
    const buf = img.buffer;
    const entry = Buffer.alloc(dirEntrySize);

    entry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buf.length, 8); // Image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // File offset of image data

    dirEntries.push(entry);
    currentOffset += buf.length;
  }

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  return Buffer.concat([
    header,
    ...dirEntries,
    ...images.map(img => img.buffer)
  ]);
}

generateFavicons().catch(console.error);
