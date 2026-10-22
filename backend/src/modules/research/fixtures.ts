import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { AddressInfo } from 'net';

export interface FixtureRoute {
  path: string;
  status?: number;
  headers?: Record<string, string>;
  body: string;
  delay?: number;
}

export class FixtureServer {
  private server: ReturnType<typeof createServer>;
  private routes: Map<string, FixtureRoute> = new Map();
  private redirectMap: Map<string, string> = new Map();
  private robotsTxt: string = '';
  private requestLog: Array<{ url: string; method: string; headers: Record<string, string> }> = [];

  constructor() {
    this.server = createServer(this.handleRequest.bind(this));
  }

  addRoute(route: FixtureRoute): this {
    this.routes.set(route.path, { ...route, status: route.status || 200 });
    return this;
  }

  addRedirect(from: string, to: string): this {
    this.redirectMap.set(from, to);
    return this;
  }

  setRobotsTxt(content: string): this {
    this.robotsTxt = content;
    return this;
  }

  getRequestLog() {
    return this.requestLog;
  }

  clearRequestLog(): this {
    this.requestLog = [];
    return this;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', `http://localhost`);
    const path = url.pathname;
    
    this.requestLog.push({
      url: req.url || '',
      method: req.method || 'GET',
      headers: req.headers as Record<string, string>,
    });

    if (path === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(this.robotsTxt);
      return;
    }

    const redirectTarget = this.redirectMap.get(path);
    if (redirectTarget) {
      res.writeHead(302, { Location: redirectTarget });
      res.end();
      return;
    }

    const route = this.routes.get(path);
    if (route) {
      if (route.delay) {
        await new Promise(r => setTimeout(r, route.delay));
      }
      
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        ...route.headers,
      };
      
      res.writeHead(route.status || 200, headers);
      res.end(route.body);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>404 Not Found</h1></body></html>');
  }

  async start(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        const address = this.server.address() as AddressInfo;
        resolve(address.port);
      });
      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => err ? reject(err) : resolve());
    });
  }

  getUrl(path = ''): string {
    const address = this.server.address() as AddressInfo;
    return `http://localhost:${address.port}${path}`;
  }
}

export function createStandardFixtures(): FixtureServer {
  const server = new FixtureServer();

  server
    .setRobotsTxt(`User-agent: *
Disallow: /private/
Disallow: /admin/
Crawl-delay: 1
Sitemap: https://example.com/sitemap.xml`)

    .addRoute({
      path: '/',
      body: `
        <html>
          <head><title>Example Corp</title></head>
          <body>
            <h1>Example Corp</h1>
            <nav><a href="/about">About</a> | <a href="/careers">Careers</a> | <a href="/blog/interview-tips">Blog</a></nav>
            <main>
              <p>We are a leading technology company.</p>
              <a href="/careers/software-engineer">Software Engineer Position</a>
              <a href="/about/culture">Our Culture</a>
              <a href="/blog/interview-tips">Interview Tips</a>
              <a href="/private/internal">Internal Notes</a>
            </main>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/about',
      body: `
        <html>
          <head><title>About Us | Example Corp</title></head>
          <body>
            <h1>About Example Corp</h1>
            <p>We build amazing software.</p>
            <a href="/about/culture">Our Culture</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/careers',
      body: `
        <html>
          <head><title>Careers | Example Corp</title></head>
          <body>
            <h1>Join Our Team</h1>
            <a href="/careers/software-engineer">Software Engineer</a>
            <a href="/careers/hiring-process">Our Hiring Process</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/careers/software-engineer',
      body: `
        <html>
          <head><title>Software Engineer | Example Corp</title></head>
          <body>
            <h1>Software Engineer</h1>
            <p>We are looking for a skilled software engineer...</p>
            <h2>Requirements</h2>
            <ul><li>TypeScript</li><li>React</li><li>Node.js</li></ul>
            <a href="/careers/hiring-process">Learn about our interview process</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/careers/hiring-process',
      body: `
        <html>
          <head><title>Hiring Process | Example Corp</title></head>
          <body>
            <h1>Our Hiring Process</h1>
            <ol>
              <li>Application review</li>
              <li>Phone screen</li>
              <li>Technical interview</li>
              <li>Take-home challenge</li>
              <li>Onsite interview</li>
            </ol>
            <a href="/careers/interview-prep">Interview preparation guide</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/careers/interview-prep',
      body: `
        <html>
          <head><title>Interview Preparation | Example Corp</title></head>
          <body>
            <h1>Interview Preparation Guide</h1>
            <p>Prepare for your interview with these resources...</p>
            <h2>Technical Topics</h2>
            <ul><li>Data structures</li><li>Algorithms</li><li>System design</li></ul>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/about/culture',
      body: `
        <html>
          <head><title>Culture | Example Corp</title></head>
          <body>
            <h1>Our Culture</h1>
            <p>We value collaboration, innovation, and work-life balance.</p>
            <a href="/about/benefits">Benefits</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/blog/interview-tips',
      body: `
        <html>
          <head><title>Interview Tips | Example Corp Blog</title></head>
          <body>
            <h1>Top 10 Interview Tips</h1>
            <article>
              <h2>1. Research the Company</h2>
              <p>Learn about our mission and values...</p>
            </article>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: '/private/internal',
      status: 200,
      body: '<html><body>Internal page</body></html>',
    })
    .addRoute({
      path: '/admin/dashboard',
      status: 200,
      body: '<html><body>Admin dashboard</body></html>',
    })
    .addRoute({
      path: '/large-page',
      body: '<html><body>' + 'x'.repeat(3 * 1024 * 1024) + '</body></html>',
    })
    .addRoute({
      path: '/slow-page',
      delay: 5000,
      body: '<html><body>Slow page</body></html>',
    })
    .addRedirect('/old-careers', '/careers')
    .addRedirect('/redirect-loop-1', '/redirect-loop-2')
    .addRedirect('/redirect-loop-2', '/redirect-loop-1');

  return server;
}

export function createPathPrefixFixtures(prefix = '/company'): FixtureServer {
  const server = new FixtureServer();

  server
    .setRobotsTxt(`User-agent: *
Disallow: ${prefix}/private/`)

    .addRoute({
      path: `${prefix}/`,
      body: `
        <html>
          <head><title>Company Home</title></head>
          <body>
            <h1>Company Home</h1>
            <a href="${prefix}/careers">Careers</a>
            <a href="${prefix}/about">About</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: `${prefix}/careers`,
      body: `
        <html>
          <head><title>Careers</title></head>
          <body>
            <h1>Careers</h1>
            <a href="${prefix}/careers/engineer">Engineer Position</a>
          </body>
        </html>
      `,
    })
    .addRoute({
      path: `${prefix}/careers/engineer`,
      body: `
        <html>
          <head><title>Engineer Position</title></head>
          <body>
            <h1>Software Engineer</h1>
            <p>We use TypeScript, React, Node.js</p>
          </body>
        </html>
      `,
    });

  return server;
}

export function createUnsafeFixtures(): FixtureServer {
  const server = new FixtureServer();

  server
    .addRoute({
      path: '/',
      body: '<html><body><a href="http://localhost:22">SSH</a><a href="http://169.254.169.254">Metadata</a></body></html>',
    });

  return server;
}