import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules')){if(id.includes('pdfjs-dist'))return 'pdf-reader';if(id.includes('fontkit')||id.includes('pdf-lib'))return 'pdf-writer';if(id.includes('utif'))return 'image-decoder';return 'vendor';}}}}}});
