#!/usr/bin/env python3
"""
SOCKS5 relay for Chrome: local HTTP CONNECT proxy -> upstream SOCKS5 with auth.
Modes: native messaging (stdio) or standalone CLI.
"""

import json
import socket
import struct
import sys
import threading
import select
import argparse
import os

RELAY_HOST = "127.0.0.1"
DEFAULT_PORT = 19876
BUFFER = 65536


class Socks5Upstream:
    def __init__(self, host, port, username="", password=""):
        self.host = host
        self.port = int(port)
        self.username = username or ""
        self.password = password or ""

    def connect(self, dest_host, dest_port, timeout=30):
        sock = socket.create_connection((self.host, self.port), timeout=timeout)
        sock.settimeout(timeout)
        self._handshake(sock, dest_host, dest_port)
        return sock

    def _handshake(self, sock, dest_host, dest_port):
        if self.username:
            sock.sendall(b"\x05\x02\x00\x02")
        else:
            sock.sendall(b"\x05\x01\x00")

        ver, method = sock.recv(2)
        if ver != 5:
            raise OSError("Invalid SOCKS5 version")

        if method == 0x02:
            u = self.username.encode()
            p = self.password.encode()
            sock.sendall(bytes([1, len(u)]) + u + bytes([len(p)]) + p)
            _, status = sock.recv(2)
            if status != 0:
                raise OSError("SOCKS5 authentication failed")
        elif method != 0x00:
            raise OSError("SOCKS5 auth method not supported")

        host_b = dest_host.encode()
        port_b = struct.pack("!H", int(dest_port))
        req = b"\x05\x01\x00\x03" + bytes([len(host_b)]) + host_b + port_b
        sock.sendall(req)

        header = sock.recv(4)
        if len(header) < 4 or header[1] != 0:
            raise OSError(f"SOCKS5 connect failed (code {header[1] if header else '?'})")

        atyp = header[3]
        if atyp == 1:
            sock.recv(4 + 2)
        elif atyp == 3:
            ln = sock.recv(1)[0]
            sock.recv(ln + 2)
        elif atyp == 4:
            sock.recv(16 + 2)


class HttpConnectRelay:
    def __init__(self, upstream: Socks5Upstream, listen_host=RELAY_HOST, listen_port=0):
        self.upstream = upstream
        self.listen_host = listen_host
        self.listen_port = listen_port
        self._server = None
        self._thread = None
        self.port = None

    def start(self):
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind((self.listen_host, self.listen_port))
        self._server.listen(64)
        self.port = self._server.getsockname()[1]
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()
        return self.port

    def stop(self):
        if self._server:
            try:
                self._server.close()
            except OSError:
                pass
            self._server = None

    def _serve(self):
        while self._server:
            try:
                client, _ = self._server.accept()
                threading.Thread(target=self._handle, args=(client,), daemon=True).start()
            except OSError:
                break

    def _handle(self, client):
        remote = None
        try:
            data = b""
            while b"\r\n\r\n" not in data and len(data) < 8192:
                chunk = client.recv(4096)
                if not chunk:
                    return
                data += chunk

            first_line = data.split(b"\r\n", 1)[0].decode("utf-8", errors="replace")
            parts = first_line.split()
            if len(parts) < 2 or parts[0].upper() != "CONNECT":
                client.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n")
                return

            host, port = parts[1].rsplit(":", 1)
            port = int(port)
            remote = self.upstream.connect(host, port)
            client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            self._pipe(client, remote)
        except Exception:
            try:
                client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            except OSError:
                pass
        finally:
            for s in (client, remote):
                if s:
                    try:
                        s.close()
                    except OSError:
                        pass

    @staticmethod
    def _pipe(a, b):
        sockets = [a, b]
        while True:
            readable, _, exceptional = select.select(sockets, [], sockets, 60)
            if exceptional:
                break
            for s in readable:
                other = b if s is a else a
                try:
                    data = s.recv(BUFFER)
                    if not data:
                        return
                    other.sendall(data)
                except OSError:
                    return


_relay = None


def start_relay(host, port, username="", password="", listen_port=0):
    global _relay
    stop_relay()
    upstream = Socks5Upstream(host, port, username, password)
    _relay = HttpConnectRelay(upstream, listen_port=listen_port or DEFAULT_PORT)
    return _relay.start()


def stop_relay():
    global _relay
    if _relay:
        _relay.stop()
        _relay = None


def read_native_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    length = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(length)
    if not data:
        return None
    return json.loads(data.decode("utf-8"))


def write_native_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def native_loop():
    while True:
        msg = read_native_message()
        if msg is None:
            stop_relay()
            break
        action = msg.get("action")
        if action == "ping":
            write_native_message({"ok": True, "port": _relay.port if _relay else None})
        elif action == "start":
            proxy = msg.get("proxy", {})
            port = start_relay(
                proxy.get("host"),
                proxy.get("port"),
                proxy.get("username", ""),
                proxy.get("password", ""),
                listen_port=msg.get("listen_port", DEFAULT_PORT),
            )
            write_native_message({"ok": True, "port": port})
        elif action == "stop":
            stop_relay()
            write_native_message({"ok": True})
        else:
            write_native_message({"ok": False, "error": "unknown action"})


def main():
    parser = argparse.ArgumentParser(description="SOCKS5 relay for Proxy Plugin")
    parser.add_argument("mode", nargs="?", choices=["native", "standalone"], default="native")
    parser.add_argument("--host", help="Upstream SOCKS5 host")
    parser.add_argument("--port", type=int, help="Upstream SOCKS5 port")
    parser.add_argument("--user", default="", help="SOCKS5 username")
    parser.add_argument("--pass", dest="password", default="", help="SOCKS5 password")
    parser.add_argument("--listen", type=int, default=DEFAULT_PORT, help="Local listen port")
    args = parser.parse_args()

    if args.mode == "standalone":
        if not args.host or not args.port:
            print("Usage: proxy_relay.py standalone --host HOST --port PORT [--user U] [--pass P] [--listen 19876]")
            sys.exit(1)
        port = start_relay(args.host, args.port, args.user, args.password, args.listen)
        print(f"Relay running on http://{RELAY_HOST}:{port} -> socks5://{args.host}:{args.port}", flush=True)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            stop_relay()
    else:
        native_loop()


if __name__ == "__main__":
    main()
