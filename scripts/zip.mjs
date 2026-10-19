// Minimal deterministic ZIP writer (deflate, no dependency). Entries are
// written in the given order with a fixed timestamp and no extra fields, so
// the same files always produce byte-identical archives.
import { crc32, deflateRawSync } from "node:zlib";

// 1980-01-01 00:00:00, the earliest DOS date.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const STORE = 0;

/** Build a ZIP archive from `[{ name, data }]` (`name` uses `/` separators). */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  const names = new Set();
  let offset = 0;
  for (const { name, data } of entries) {
    if (name === "" || name.startsWith("/") || name.split("/").includes("..") || name.includes("\\")) {
      throw new Error(`Unsafe archive path: ${name}`);
    }
    if (names.has(name)) throw new Error(`Duplicate archive path: ${name}`);
    names.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? DEFLATE : STORE;
    const body = method === DEFLATE ? deflated : data;
    const crc = crc32(data);
    if (body.length >= 0xffffffff || data.length >= 0xffffffff || offset >= 0xffffffff) {
      throw new Error("Archive too large for ZIP32");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | VERSION, 4); // made by: Unix
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  if (names.size >= 0xffff) throw new Error("Too many archive entries for ZIP32");
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.size, 8);
  end.writeUInt16LE(names.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
