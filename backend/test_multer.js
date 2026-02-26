const FormData = require('form-data');
const fs = require('fs');
const http = require('http');

// create a dummy buffer of 80KB
const buffer = Buffer.alloc(80474, 'a');

const form = new FormData();
form.append('audio', buffer, {
  filename: 'audio-chunk-123.webm',
  contentType: 'audio/webm'
});

console.log('FormData generated. Length:', form.getLengthSync());
