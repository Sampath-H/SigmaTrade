// pages/api/proto-decode.js
// Minimal protobuf decoder for Upstox MarketDataFeed
// Based on MarketDataFeed_pb2.py structure

// Protobuf wire types
const WIRE_VARINT = 0;
const WIRE_64BIT  = 1;
const WIRE_LEN    = 2;
const WIRE_32BIT  = 5;

class ProtoReader {
  constructor(buffer) {
    this.buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.pos = 0;
  }

  eof() { return this.pos >= this.buf.length; }

  readByte() { return this.buf[this.pos++]; }

  readVarint() {
    let result = 0n, shift = 0n;
    while (true) {
      const byte = this.readByte();
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if (!(byte & 0x80)) break;
    }
    return result;
  }

  readVarintNum() { return Number(this.readVarint()); }

  readDouble() {
    const bytes = this.buf.slice(this.pos, this.pos + 8);
    this.pos += 8;
    return new DataView(bytes.buffer, bytes.byteOffset).getFloat64(0, true);
  }

  readFloat() {
    const bytes = this.buf.slice(this.pos, this.pos + 4);
    this.pos += 4;
    return new DataView(bytes.buffer, bytes.byteOffset).getFloat32(0, true);
  }

  readBytes(len) {
    const bytes = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  readString(len) {
    return new TextDecoder().decode(this.readBytes(len));
  }

  skip(wireType) {
    switch (wireType) {
      case WIRE_VARINT: this.readVarint(); break;
      case WIRE_64BIT:  this.pos += 8; break;
      case WIRE_32BIT:  this.pos += 4; break;
      case WIRE_LEN: {
        const len = this.readVarintNum();
        this.pos += len;
        break;
      }
    }
  }

  readTag() {
    const tag = this.readVarintNum();
    return { field: tag >> 3, wireType: tag & 0x7 };
  }
}

// Parse LTPC message (field 1=ltp, 2=ltt, 3=ltq, 4=cp)
function parseLTPC(reader, end) {
  const out = { ltp: 0, ltt: 0, cp: 0 };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_64BIT) out.ltp = reader.readDouble();
    else if (field === 2 && wireType === WIRE_VARINT) out.ltt = reader.readVarintNum();
    else if (field === 4 && wireType === WIRE_64BIT) out.cp = reader.readDouble();
    else reader.skip(wireType);
  }
  return out;
}

// Parse OptionGreeks (field 3=iv, 4=delta, 5=theta, 6=gamma, 7=vega)
function parseOptionGreeks(reader, end) {
  const out = { iv: 0, delta: 0, theta: 0, gamma: 0, vega: 0 };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if      (field === 3 && wireType === WIRE_64BIT) out.iv    = reader.readDouble();
    else if (field === 4 && wireType === WIRE_64BIT) out.delta = reader.readDouble();
    else if (field === 5 && wireType === WIRE_64BIT) out.theta = reader.readDouble();
    else if (field === 6 && wireType === WIRE_64BIT) out.gamma = reader.readDouble();
    else if (field === 7 && wireType === WIRE_64BIT) out.vega  = reader.readDouble();
    else reader.skip(wireType);
  }
  return out;
}

// Parse ExtendedFeedDetails (field 4=oi, 5=changeOi)
function parseExtendedFeed(reader, end) {
  const out = { oi: 0, changeOi: 0 };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if      (field === 4 && wireType === WIRE_64BIT) out.oi       = reader.readDouble();
    else if (field === 5 && wireType === WIRE_64BIT) out.changeOi = reader.readDouble();
    else reader.skip(wireType);
  }
  return out;
}

// Parse MarketFullFeed (field 1=ltpc, 3=optionGreeks, 5=eFeedDetails)
function parseMarketFullFeed(reader, end) {
  const out = { ltpc: {}, optionGreeks: {}, oi: 0 };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      out.ltpc = parseLTPC(reader, reader.pos + len);
    } else if (field === 3 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      out.optionGreeks = parseOptionGreeks(reader, reader.pos + len);
    } else if (field === 5 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      const ef = parseExtendedFeed(reader, reader.pos + len);
      out.oi = ef.oi;
    } else {
      reader.skip(wireType);
    }
  }
  return out;
}

// Parse IndexFullFeed (field 1=ltpc)
function parseIndexFullFeed(reader, end) {
  const out = { ltpc: {} };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      out.ltpc = parseLTPC(reader, reader.pos + len);
    } else {
      reader.skip(wireType);
    }
  }
  return out;
}

// Parse OptionChain feed (field 1=ltpc, 3=optionGreeks, 4=eFeedDetails)
function parseOptionChainFeed(reader, end) {
  const out = { ltpc: {}, optionGreeks: {}, oi: 0 };
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      out.ltpc = parseLTPC(reader, reader.pos + len);
    } else if (field === 3 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      out.optionGreeks = parseOptionGreeks(reader, reader.pos + len);
    } else if (field === 4 && wireType === WIRE_LEN) {
      const len = reader.readVarintNum();
      const ef = parseExtendedFeed(reader, reader.pos + len);
      out.oi = ef.oi;
    } else {
      reader.skip(wireType);
    }
  }
  return out;
}

// Parse Feed (field 1=ltpc, 2=ff/FullFeed, 3=oc/OptionChain)
function parseFeed(reader, end) {
  const out = {};
  while (reader.pos < end) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_LEN) {
      // LTPC only feed
      const len = reader.readVarintNum();
      out.ltpc = parseLTPC(reader, reader.pos + len);
    } else if (field === 2 && wireType === WIRE_LEN) {
      // FullFeed (ff)
      const len = reader.readVarintNum();
      const end2 = reader.pos + len;
      out.ff = {};
      while (reader.pos < end2) {
        const { field: f2, wireType: wt2 } = reader.readTag();
        const l2 = reader.readVarintNum();
        if (f2 === 1) {
          out.ff.marketFF = parseMarketFullFeed(reader, reader.pos + l2);
        } else if (f2 === 2) {
          out.ff.indexFF = parseIndexFullFeed(reader, reader.pos + l2);
        } else {
          reader.pos += l2;
        }
      }
    } else if (field === 3 && wireType === WIRE_LEN) {
      // OptionChain feed (oc)
      const len = reader.readVarintNum();
      out.oc = parseOptionChainFeed(reader, reader.pos + len);
    } else {
      reader.skip(wireType);
    }
  }
  return out;
}

// Parse FeedResponse (field 1=type, 2=feeds map)
export function decodeFeedResponse(buffer) {
  const reader = new ProtoReader(buffer);
  const feeds = {};
  let type = 0;

  while (!reader.eof()) {
    const { field, wireType } = reader.readTag();
    if (field === 1 && wireType === WIRE_VARINT) {
      type = reader.readVarintNum();
    } else if (field === 2 && wireType === WIRE_LEN) {
      // FeedsEntry (map entry): field 1=key(string), field 2=value(Feed)
      const entryLen = reader.readVarintNum();
      const entryEnd = reader.pos + entryLen;
      let key = '';
      let feedData = {};
      while (reader.pos < entryEnd) {
        const { field: ef, wireType: ewt } = reader.readTag();
        if (ef === 1 && ewt === WIRE_LEN) {
          const klen = reader.readVarintNum();
          key = reader.readString(klen);
        } else if (ef === 2 && ewt === WIRE_LEN) {
          const flen = reader.readVarintNum();
          feedData = parseFeed(reader, reader.pos + flen);
        } else {
          reader.skip(ewt);
        }
      }
      if (key) feeds[key] = feedData;
    } else {
      reader.skip(wireType);
    }
  }

  return { type, feeds };
}

// Extract tick update from decoded feed
export function extractTickUpdate(key, feed) {
  const update = {};

  // Try OptionChain feed first (mode: option_greeks)
  if (feed.oc) {
    const oc = feed.oc;
    const ltp = oc.ltpc?.ltp || 0;
    if (ltp > 0) {
      update.ltp   = ltp;
      update.oi    = oc.oi || 0;
      update.iv    = (oc.optionGreeks?.iv || 0) * 100; // convert to %
      update.delta = oc.optionGreeks?.delta || 0;
      update.theta = oc.optionGreeks?.theta || 0;
      update.gamma = oc.optionGreeks?.gamma || 0;
      update.vega  = oc.optionGreeks?.vega  || 0;
    }
    return Object.keys(update).length ? update : null;
  }

  // Try full feed (mode: full or ltpc)
  if (feed.ff) {
    const ff = feed.ff;
    const market = ff.marketFF || ff.indexFF || {};
    const ltp = market.ltpc?.ltp || feed.ltpc?.ltp || 0;
    if (ltp > 0) {
      update.ltp   = ltp;
      update.oi    = market.oi || 0;
      update.iv    = (market.optionGreeks?.iv || 0) * 100;
      update.delta = market.optionGreeks?.delta || 0;
      update.theta = market.optionGreeks?.theta || 0;
    }
    return Object.keys(update).length ? update : null;
  }

  // LTPC only
  if (feed.ltpc) {
    const ltp = feed.ltpc.ltp || 0;
    if (ltp > 0) {
      update.ltp = ltp;
      return update;
    }
  }

  return null;
}
