export class CookieJar {
  private cookies = new Map<string, string>();

  absorb(setCookieHeaders: readonly string[]): void {
    for (const raw of setCookieHeaders) {
      const firstSemi = raw.indexOf(";");
      const pair = firstSemi === -1 ? raw : raw.slice(0, firstSemi);
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  seedFromHeader(cookieHeader: string): void {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name && value) this.cookies.set(name, value);
    }
  }

  toHeader(): string {
    const names = [...this.cookies.keys()].sort();
    return names.map((n) => `${n}=${this.cookies.get(n)}`).join("; ");
  }
}
