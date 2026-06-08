import fs from 'fs';
import path from 'path';

async function downloadLogo() {
  const targetUrl = 'https://encorefinancials.com/assets/images/application-settings/logo-dark.png';
  const imgDir = path.join(process.cwd(), 'public', 'assets', 'img');
  
  // Ensure the directory exists
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }
  
  const destPath = path.join(imgDir, 'logo.png');
  
  console.log(`Starting logo pre-download to local folder: ${destPath}`);
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://encorefinancials.com/'
      }
    });
    
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      console.log(`Successfully downloaded and saved logo.png (${buffer.length} bytes) to public/assets/img/logo.png`);
      
      // Also write to an applet src/assets subdirectory if needed
      const srcAssetsDir = path.join(process.cwd(), 'src', 'assets');
      if (!fs.existsSync(srcAssetsDir)) {
        fs.mkdirSync(srcAssetsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(srcAssetsDir, 'logo.png'), buffer);
      console.log(`Successfully saved a second copy to src/assets/logo.png`);
      process.exit(0);
    } else {
      throw new Error(`Response status code is not ok: ${response.status}`);
    }
  } catch (error) {
    console.warn(`Could not download original PNG logo:`, error);
    console.log('Generating fallback high-fidelity inline asset instead...');
    
    // We will write an elegant transparent blank or standard fallback vector SVG inside public/assets/img/logo.svg
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 120" width="500" height="120">
      <rect width="100%" height="100%" fill="transparent"/>
      <g transform="translate(10, 10)">
        <path d="M 15 15 L 75 15 L 90 55 L 30 55 Z" fill="#102CA4" />
        <path d="M 40 62 L 100 62 L 115 102 L 55 102 Z" fill="#D4AF37" />
        <rect x="15" y="56" width="85" height="4" fill="#102CA4" opacity="0.35" />
        <text x="135" y="58" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="44" letter-spacing="5" fill="#102CA4">ENCORE</text>
        <text x="137" y="90" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="16" letter-spacing="2" fill="#5c6f84">LEASING &amp; FINANCE CORP.</text>
      </g>
    </svg>`;
    
    const svgDestPath = path.join(imgDir, 'logo.svg');
    fs.writeFileSync(svgDestPath, logoSvg);
    console.log(`Saved logo.svg fallback at ${svgDestPath}`);
    
    // Create a fallback transparent/empty placeholder logo.png so Vite doesn't complain of missing imports or files
    // This is a minimal 1x1 transparent PNG pixel base64
    const minPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    fs.writeFileSync(destPath, Buffer.from(minPngBase64, 'base64'));
    
    const srcAssetsDir = path.join(process.cwd(), 'src', 'assets');
    if (!fs.existsSync(srcAssetsDir)) {
      fs.mkdirSync(srcAssetsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(srcAssetsDir, 'logo.png'), Buffer.from(minPngBase64, 'base64'));
    fs.writeFileSync(path.join(srcAssetsDir, 'logo.svg'), logoSvg);
    
    console.log('Saved 1x1 placeholder logo.png and local logo.svg as final fail-safes.');
    process.exit(0);
  }
}

downloadLogo();
