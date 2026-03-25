import * as http from 'node:http';

export interface Snapshotable {
  getSnapshot(): Record<string, unknown>;
}

export class OrchestratorServer {
  private server: http.Server;
  private orchestrator: Snapshotable;
  private port: number;

  constructor(orchestrator: Snapshotable, port: number) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method, url } = req;

    if (method === 'GET' && url === '/api/v1/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`Orchestrator API listening on localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): void {
    this.server.close();
  }
}
