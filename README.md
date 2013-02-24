# Installing waver
To install your super-duper wave reader into your node.js aplication just run the following:

        npm install waver
        

# Simple usage
You will need an audio buffer (only WAVE PCM without compression is supported at this time). The following sample code should get you started:

    var waver = require('waver');
    
    var audioBuffer = require('fs').readFileSync('pathToYourFile');
    
    waver.readRaw(audioBuffer, function(e,wave){ 
      
      if (e) console.log('Error: ', e);
      
      console.log(wave);
  
    });


This will output the following JSON structure:

    { RIFFChunk: { ChunkID: 'RIFF', Format: 'WAVE', ChunkSize: 17147876 },
      FormatChunk: 
       { Subchunk1ID: 'fmt ',
         Subchunk1Size: 16,
         AudioFormat: 1,
         NumChannels: 1,
         SampleRate: 8000,
         ByteRate: 16000,
         BlockAlign: 2,
         BitsPerSample: 16 },
      DataChunk: 
       { Subchunk2ID: 'data',
         Subchunk2Size: 17147840,
         Data: <Buffer 08 00 08 00 08 00 08 00 08 00 08 00 08 00 08 00 08 00 0 ...> } }
         
Instead of ``readRaw`` you can use the ``read`` method to return an aditional element with the audio data in a numeric form.
