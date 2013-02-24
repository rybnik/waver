// FIXME: I believe that there's something wrong with the way I'm invoking async... odd things happen when an error ocurrs inside parallel
var async   = require('async');

var _readRIFFChunk = function(buf, cb) {

    var RIFFChunk = {
        ChunkID:    function(r) { try { return r(null, buf.toString('ascii', 0,  4) ) } catch(e){ return r(e); }},
        Format:     function(r) { try { return r(null, buf.toString('ascii', 8, 12) ) } catch(e){ return r(e); }},
        ChunkSize:  function(r) { try { return r(null, buf.readUInt32LE(4)          ) } catch(e){ return r(e); }} 
    };

    async.parallel(RIFFChunk, function(e,r){

        if (e) return cb(e);

        // Integrity validation
        if (r.ChunkID   !== 'RIFF') return cb(new Error('_readRIFFChunk: Wrong ChunkID: '  + r.ChunkID ));
        if (r.Format    !== 'WAVE') return cb(new Error('_readRIFFChunk: Wrong Format: '   + r.Format));

        return cb(null, r);
    });
}

var _readFormatChunk = function(buf, cb) {

    var formatChunk = {
        Subchunk1ID:    function(r) { try { return r(null, buf.toString('ascii', 0,  4) ) } catch(e){ return r(e); }},
        Subchunk1Size:  function(r) { try { return r(null, buf.readUInt32LE(4)          ) } catch(e){ return r(e); }},
        AudioFormat:    function(r) { try { return r(null, buf.readUInt16LE(8)          ) } catch(e){ return r(e); }},
        NumChannels:    function(r) { try { return r(null, buf.readUInt16LE(10)         ) } catch(e){ return r(e); }},
        SampleRate:     function(r) { try { return r(null, buf.readUInt32LE(12)         ) } catch(e){ return r(e); }},
        ByteRate:       function(r) { try { return r(null, buf.readUInt32LE(16)         ) } catch(e){ return r(e); }},
        BlockAlign:     function(r) { try { return r(null, buf.readUInt16LE(20)         ) } catch(e){ return r(e); }},
        BitsPerSample:  function(r) { try { return r(null, buf.readUInt16LE(22)         ) } catch(e){ return r(e); }}
    };

    async.parallel(formatChunk, function(e,r){

        if (e) return cb(e);

        // Integrity validation
        if (r.Subchunk1ID   !== 'fmt ') return cb(new Error('_readFormatChunk: Wrong Subchunk1ID: '                                      + r.Subchunk1ID ));
        if (r.Subchunk1Size !== 16)     return cb(new Error('_readFormatChunk: Unexpected Subchunk1Size (only PCM is supported): '       + r.Subchunk1Size ));
        if (r.AudioFormat   !== 1)      return cb(new Error('_readFormatChunk: Unexpected AudioFormat (compression is not supported): '  + r.AudioFormat ));

        if (r.ByteRate !== (r.SampleRate * r.NumChannels * r.BitsPerSample/8)) return cb(
            new Error('_readFormatChunk: Mismatched ByteRate: ' + r.ByteRate ));

        if (r.BlockAlign !== (r.NumChannels * r.BitsPerSample/8)) return cb(
            new Error('_readFormatChunk: Mismatched BlockAlign: ' + r.BlockAlign ));

        return cb(null, r);
    });    
}

var _readDataChunk = function(buf, cb) {

    var dataChunk = {
        Subchunk2ID:    function(r) { try { return r(null, buf.toString('ascii', 0,  4) ) } catch(e){ return r(e); }},
        Subchunk2Size:  function(r) { try { return r(null, buf.readUInt32LE(4)          ) } catch(e){ return r(e); }},
        Data:           function(r) { try { return r(null, buf.slice(8)                 ) } catch(e){ return r(e); }}
    };

    async.parallel(dataChunk, function(e, r) {

        if (e) return cb(e);

        // Integrity validation
        if (r.Subchunk2ID   !== 'data') return cb(new Error('_readFormatChunk: Wrong Subchunk2ID: ' + r.Subchunk2ID ));
        // TODO: Should provide more validation

        return cb(null, r);
    });  
}

var _processChannels = function(wave, cb) {
    
    // TODO: Should check for FormatChunk integrity
    if (!wave.DataChunk)        return cb(new Error('_processChannels: DataChunk is missing: '      + wave));
    if (!wave.DataChunk.Data)   return cb(new Error('_processChannels: DataChunk.Data is missing: ' + wave.DataChunk));
    if (!wave.DataChunk.Data)   return cb(null, wave);

    // Assemble channels structure
    var numSamples = wave.DataChunk.Subchunk2Size/(wave.FormatChunk.BitsPerSample*0.125);

    // Unpack helpers... not the best implementations but fast enough
    var Channels;
    var _unpack8  = function() { Channels = new Int8Array(numSamples);  for (var s = 0; s < numSamples; s++)  Channels[s] = wave.DataChunk.Data.readInt8(s);      };
    var _unpack16 = function() { Channels = new Int16Array(numSamples); for (var s = 0; s < numSamples; s++)  Channels[s] = wave.DataChunk.Data.readInt16LE(s*2); };
    var _unpack32 = function() { Channels = new Int32Array(numSamples); for (var s = 0; s < numSamples; s++)  Channels[s] = wave.DataChunk.Data.readInt32LE(s*4); };

    switch(wave.FormatChunk.BitsPerSample) {

        case  8: _unpack8();  break;
        case 16: _unpack16(); break;
        case 32: _unpack32(); break;  

        default: return cb(new Error('_processChannels: Awkward BitsPerSample value: ' + wave.FormatChunk.BitsPerSample));
    }

    wave.DataChunk.Channels = Channels; 

    return cb(null, wave);        
}

var _readRaw = function(buf, cb) {
    
    if (!(buf instanceof Buffer)) return cb(new Error('_readRaw: buf object is of wrong type.'));

    try {

        var rawRIFFChunk    = buf.slice(0,  12);
        var rawFormatChunk  = buf.slice(12, 36);
        var rawDataChunk    = buf.slice(36);
    
    } catch(e) { return cb(e); }   
    
        var wave = {
            RIFFChunk:      function(r) { return _readRIFFChunk(rawRIFFChunk,       r); },
            FormatChunk:    function(r) { return _readFormatChunk(rawFormatChunk,   r); },
            DataChunk:      function(r) { return _readDataChunk(rawDataChunk,       r); }
        }
    
    async.parallel(wave, cb);
}

var _read = function(buf, cb) { 

    _readRaw(buf, function(e,r) { 
        if (e) return cb(e);
        _processChannels(r, cb);
    }); 

}

module.exports.read     = _read;
module.exports.readRaw  = _readRaw;