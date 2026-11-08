import fs from "fs";
import path from "path";

let initialized = false;

export function getDataDir(): string {
  const isVercel = Boolean(process.env.VERCEL);
  const targetDir = isVercel ? "/tmp/miado-data" : path.join(process.cwd(), "data");

  if (!initialized) {
    initialized = true;
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // On Vercel, copy initial seed files from repo's data directory into /tmp/miado-data
      if (isVercel) {
        const seedDir = path.join(process.cwd(), "data");
        if (fs.existsSync(seedDir)) {
          try {
            const files = fs.readdirSync(seedDir);
            for (const file of files) {
              const srcPath = path.join(seedDir, file);
              const destPath = path.join(targetDir, file);
              if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          } catch (seedErr) {
            console.warn("Aviso ao copiar arquivos de seed para /tmp:", seedErr);
          }
        }
      }
    } catch (err) {
      console.warn("Aviso ao inicializar DATA_DIR:", err);
    }
  }

  return targetDir;
}
