import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function test() {
  const fd = new FormData();
  fs.writeFileSync('dummy.webm', 'test audio data');
  fd.append('audio', fs.createReadStream('dummy.webm'));
  
  try {
    const res = await fetch('http://localhost:5000/api/whisper/audio/test-meeting', {
      method: 'POST',
      body: fd,
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN || ''}`
      }
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}
test();
