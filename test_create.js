const { spawn } = require('child_process');

const mcpProcess = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let initialized = false;
let sessionId = null;

mcpProcess.stdout.on('data', (data) => {
  console.log('MCP stdout:', data.toString());
});

mcpProcess.stderr.on('data', (data) => {
  console.log('MCP stderr:', data.toString());
});

// Wait a bit then send initialize
setTimeout(() => {
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };
  
  mcpProcess.stdin.write(JSON.stringify(initMessage) + '\n');
}, 3000);

// Wait for initialize response then call tools/list
setTimeout(() => {
  const listMessage = {
    jsonrpc: '2.0', 
    id: 2,
    method: 'tools/list',
    params: {}
  };
  
  mcpProcess.stdin.write(JSON.stringify(listMessage) + '\n');
}, 5000);

setTimeout(() => {
  mcpProcess.kill();
}, 10000);
