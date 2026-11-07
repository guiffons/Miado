import { describe, it, expect } from "vitest";
import { isPrivateIpAddress, validateOutboundUrl, detectImageMimeType } from "../net/safeFetch";
import { ALLOWED_IMAGE_HOSTS, isHostAllowed } from "../net/allowlists";

describe("safeFetch & allowlists", () => {
  it("identifies loopback, RFC1918, link-local, and IPv6 private addresses", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("172.16.5.4")).toBe(true);
    expect(isPrivateIpAddress("192.168.1.10")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("::1")).toBe(true);
    expect(isPrivateIpAddress("fe80::1")).toBe(true);
    expect(isPrivateIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
    expect(isPrivateIpAddress("1.1.1.1")).toBe(false);
  });

  it("rejects non-HTTPS, credentialed, or non-allowlisted outbound URLs", async () => {
    const publicLookup = async () => [{ address: "23.54.12.8", family: 4 }];
    await expect(validateOutboundUrl("http://is1-ssl.mzstatic.com/img.jpg", ALLOWED_IMAGE_HOSTS, publicLookup)).rejects.toThrow();
    await expect(validateOutboundUrl("file:///etc/passwd", ALLOWED_IMAGE_HOSTS, publicLookup)).rejects.toThrow();
    await expect(validateOutboundUrl("https://user:pass@is1-ssl.mzstatic.com/img.jpg", ALLOWED_IMAGE_HOSTS, publicLookup)).rejects.toThrow();
    await expect(validateOutboundUrl("https://169.254.169.254/latest/meta-data", ALLOWED_IMAGE_HOSTS, publicLookup)).rejects.toThrow();
    await expect(validateOutboundUrl("https://evil.example.com/a.jpg", ALLOWED_IMAGE_HOSTS, publicLookup)).rejects.toThrow();

    const parsed = await validateOutboundUrl(
      "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/cover.jpg",
      ALLOWED_IMAGE_HOSTS,
      publicLookup
    );
    expect(parsed.hostname).toBe("is1-ssl.mzstatic.com");
  });

  it("sniffs JPEG, PNG, WebP, and GIF magic bytes accurately and rejects HTML/SVG", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]);
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const html = Buffer.from("<!DOCTYPE html><script>alert(1)</script>");

    expect(detectImageMimeType(jpeg)).toBe("image/jpeg");
    expect(detectImageMimeType(png)).toBe("image/png");
    expect(detectImageMimeType(gif)).toBe("image/gif");
    expect(detectImageMimeType(webp)).toBe("image/webp");
    expect(detectImageMimeType(html)).toBeNull();
  });

  it("validates allowlisted image hostnames", () => {
    expect(isHostAllowed("is1-ssl.mzstatic.com", ALLOWED_IMAGE_HOSTS)).toBe(true);
    expect(isHostAllowed("e-cdns-images.dzcdn.net", ALLOWED_IMAGE_HOSTS)).toBe(true);
    expect(isHostAllowed("evil.example.com", ALLOWED_IMAGE_HOSTS)).toBe(false);
    expect(isHostAllowed("127.0.0.1", ALLOWED_IMAGE_HOSTS)).toBe(false);
  });
});
