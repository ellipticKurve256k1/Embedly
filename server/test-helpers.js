import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

export function createMockDb({ getResult = null, allResult = [], runResult = { changes: 1 } } = {}) {
  return {
    prepare: () => ({
      run: () => runResult,
      get: () => getResult,
      all: () => allResult,
    }),
    transaction: (callback) => () => callback(),
  };
}

export function createMockResponse() {
  const response = {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };

  return response;
}

export async function withTestServer(app, callback) {
  const server = createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

export async function dispatchExpress(app, {
  method = 'GET',
  path = '/',
  body,
  headers = {},
} = {}) {
  const requestBody = body === undefined ? null : JSON.stringify(body);
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  const request = new IncomingMessage(socket);
  request.method = method;
  request.url = path;
  request.headers = {
    host: 'localhost',
    ...(requestBody === null ? {} : {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(requestBody),
    }),
    ...headers,
  };

  const chunks = [];
  const response = new ServerResponse(request);
  response.assignSocket(socket);
  response.write = (chunk, encoding, callback) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }
    if (typeof callback === 'function') callback();
    return true;
  };
  response.end = (chunk, encoding, callback) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }
    response.finished = true;
    if (typeof callback === 'function') callback();
    response.emit('finish');
    return response;
  };

  await new Promise((resolve, reject) => {
    response.on('finish', resolve);
    response.on('error', reject);
    app.handle(request, response, reject);

    if (requestBody !== null) {
      request.push(requestBody);
    }
    request.push(null);
  });

  const text = Buffer.concat(chunks).toString('utf8');
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return {
    status: response.statusCode,
    headers: response.getHeaders(),
    text,
    body: payload,
  };
}
