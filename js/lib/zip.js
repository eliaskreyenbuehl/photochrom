// Minimal ZIP archives, no library: writing (entries stored uncompressed: PNG and JPEG are
// compressed already) and reading (stored and deflated entries, the latter through the
// browser's DecompressionStream). Enough for the annotation export/import; no ZIP64,
// no encryption, archives up to 4 GB.
//
//   const blob = await zipBlob([{ name: 'annotations/x.json', data: '{…}' }, { name: 'media/y.png', data: file }]);
//   for (const entry of await unzip(file)) console.log(entry.name, await entry.blob());

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** CRC of a blob, read in chunks so large images do not need one big buffer. */
async function crcOfBlob(blob) {
  const CHUNK = 8 * 1024 * 1024;
  let crc = 0;
  for (let at = 0; at < blob.size; at += CHUNK) {
    crc = crc32(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()), crc);
  }
  return crc;
}

/** MS-DOS time and date (local time, 2 s resolution). */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const UTF8_FLAG = 0x0800; // names are UTF-8

/**
 * Build a ZIP file.
 * @param entries  [{ name, data: Blob | string | Uint8Array, date?: Date }]
 * @returns {Promise<Blob>}
 */
export async function zipBlob(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
    const name = encoder.encode(entry.name);
    const crc = await crcOfBlob(data);
    const { time, day } = dosDateTime(entry.date ?? (entry.data instanceof File ? new Date(entry.data.lastModified) : new Date()));
    if (offset + data.size > 0xffffffff) throw new Error('The archive would be larger than 4 GB.');

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.size, true);
    local.setUint32(22, data.size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); // made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, UTF8_FLAG, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, day, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.size, true);
    dir.setUint32(24, data.size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(dir.buffer, name);

    offset += 30 + name.length + data.size;
  }
  const dirSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

const view = async (blob, start, length) => new DataView(await blob.slice(start, start + length).arrayBuffer());

/**
 * Read the entries of a ZIP file (directories are skipped).
 * @returns {Promise<Array<{ name, size, blob(): Promise<Blob>, text(): Promise<string> }>>}
 */
export async function unzip(file) {
  // End of central directory: 22 bytes plus an optional comment of up to 64 KB at the end.
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = await view(file, tailStart, file.size - tailStart);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP file.');
  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  const dir = await view(file, dirOffset, dirSize);
  const decoder = new TextDecoder();
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (dir.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged ZIP file (central directory).');
    const method = dir.getUint16(p + 10, true);
    const compressed = dir.getUint32(p + 20, true);
    const size = dir.getUint32(p + 24, true);
    const nameLength = dir.getUint16(p + 28, true);
    const extraLength = dir.getUint16(p + 30, true);
    const commentLength = dir.getUint16(p + 32, true);
    const localOffset = dir.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;

    const blob = async () => {
      const local = await view(file, localOffset, 30);
      if (local.getUint32(0, true) !== 0x04034b50) throw new Error(`Damaged ZIP file (${name}).`);
      const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      const raw = file.slice(start, start + compressed);
      if (method === 0) return raw;
      if (method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      throw new Error(`${name}: unsupported ZIP compression (method ${method}).`);
    };
    entries.push({ name, size, blob, text: async () => (await blob()).text() });
  }
  return entries;
}
