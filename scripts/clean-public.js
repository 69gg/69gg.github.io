'use strict';

const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '..', 'public');

fs.rmSync(publicDir, { force: true, recursive: true });
