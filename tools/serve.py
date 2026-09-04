"""Serve the built app on the local network, for testing on a real phone.

Replaces round-tripping through Netlify while iterating. Prints the LAN address to
open on the phone; both devices must be on the same wifi.

    python tools/serve.py            # port 8787
    python tools/serve.py --port 9000

Note: service workers only register on https or localhost, so over a LAN IP the app
runs but offline caching is inactive. Everything else behaves normally.
"""

import argparse
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always serve fresh: a cached page during iteration wastes more time than
        # the bandwidth saves.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET / " in (fmt % args) or ".html" in (fmt % args):
            sys.stderr.write("  %s\n" % (fmt % args))


def lan_addresses():
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))          # no packets sent; just picks the route
        out.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except OSError:
        pass
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--dir", type=Path, default=ROOT / "site")
    args = ap.parse_args()

    if not (args.dir / "index.html").exists():
        sys.exit(f"nothing built at {args.dir} — run python tools/build_site.py first")

    handler = partial(Handler, directory=str(args.dir))
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)

    print(f"serving {args.dir}")
    print(f"  this machine : http://localhost:{args.port}")
    for ip in lan_addresses():
        print(f"  on your phone: http://{ip}:{args.port}")
    print("\nCtrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
