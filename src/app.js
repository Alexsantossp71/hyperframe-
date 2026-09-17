import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const frameInputs = [...document.querySelectorAll('.frame-text')];
const imageInputs = [...document.querySelectorAll('.bg-input')];
const title = document.querySelector('#sceneTitle');
const kicker = document.querySelector('#sceneKicker');
const stage = document.querySelector('#stage');
const duration = document.querySelector('#duration');
const timecode = document.querySelector('#timecode');
const exportBox = document.querySelector('#export');
const status = document.querySelector('.status');
const progressWrap = document.querySelector('#progressWrap');
const progressBar = document.querySelector('#progressBar');
const progressValue = document.querySelector('#progressValue');
const progressLabel = document.querySelector('#progressLabel');
const styles = { signal:['#111b24','#183b39','#9eab4d','#d8fa88'], editorial:['#e5e0d5','#a99d8a','#443e37','#fff8ea'], neon:['#160d29','#33125e','#e84d9b','#64f5ff'] };
let selectedStyle = 'signal';
let currentFrame = 0;
let images = Array(6).fill(null);
let renderedVideo = null;

function setProgress(value, label) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  progressWrap.classList.add('active');
  progressBar.style.width = `${percent}%`;
  progressValue.textContent = `${percent}%`;
  progressLabel.textContent = label;
}

const totalDuration = () => Number(duration.value) * 6;
const getText = (i) => frameInputs[i].value.trim() || `Frame ${String(i + 1).padStart(2, '0')}`;

function visualBackground() {
  const s = styles[selectedStyle];
  const image = images[currentFrame];
  stage.style.backgroundImage = `linear-gradient(125deg,${s[0]}aa,${s[1]}aa 55%,${s[2]}aa),${image ? `url("${image.src}")` : 'none'}`;
  stage.style.backgroundSize = image ? 'cover' : 'auto';
  stage.style.backgroundPosition = 'center';
}

function showFrame(index) {
  currentFrame = index;
  title.textContent = getText(index);
  kicker.textContent = `FRAME ${String(index + 1).padStart(2, '0')} / 06`;
  timecode.textContent = `00:${String(index * Number(duration.value)).padStart(2, '0')} / 00:${String(totalDuration()).padStart(2, '0')}`;
  document.querySelectorAll('#frameNav button').forEach((b, i) => b.classList.toggle('active', i === index));
  visualBackground();
  stage.classList.remove('animate');
  void stage.offsetWidth;
  stage.classList.add('animate');
}

document.querySelectorAll('.style').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.style').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  selectedStyle = btn.dataset.style;
  const s = styles[selectedStyle];
  document.documentElement.style.setProperty('--lime', s[3]);
  document.querySelector('.scene-kicker').style.color = s[3];
  document.querySelector('.scene-line').style.background = s[3];
  visualBackground();
});
document.querySelectorAll('#frameNav button').forEach((btn, i) => btn.onclick = () => showFrame(i));
document.querySelector('#generate').onclick = () => { showFrame(0); exportBox.classList.add('show'); };
document.querySelector('#replay').onclick = () => showFrame(currentFrame);
duration.onchange = () => showFrame(currentFrame);
frameInputs.forEach((input, i) => input.oninput = () => { if (i === currentFrame) showFrame(i); });
imageInputs.forEach((input, i) => input.onchange = () => {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { const image = new Image(); image.onload = () => { images[i] = image; showFrame(i); }; image.src = reader.result; };
  reader.readAsDataURL(file);
});

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCanvasFrame(ctx, frameIndex, progress) {
  const SCALE = ctx.canvas.width / 1080;
  const W = 1080, H = 1920, s = styles[selectedStyle];
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = s[1]; ctx.fillRect(0, 0, W, H);
  const image = images[frameIndex];
  if (image) {
    const scale = Math.max(W / image.width, H / image.height);
    const iw = image.width * scale, ih = image.height * scale;
    ctx.drawImage(image, (W - iw) / 2, (H - ih) / 2, iw, ih);
  }
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, `${s[0]}dd`); gradient.addColorStop(.58, `${s[1]}99`); gradient.addColorStop(1, `${s[2]}cc`);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = s[3]; ctx.font = '500 24px monospace'; ctx.letterSpacing = '4px';
  ctx.fillText(`FRAME ${String(frameIndex + 1).padStart(2, '0')} / 06`, 110, 260);
  const eased = 1 - Math.pow(1 - Math.min(progress * 2.2, 1), 3);
  ctx.globalAlpha = eased; ctx.fillStyle = '#ffffff'; ctx.font = '800 84px Manrope, Arial'; ctx.letterSpacing = '0px';
  const lines = wrapText(ctx, getText(frameIndex), W - 220);
  const startY = H / 2 - ((lines.length - 1) * 100) / 2 + (1 - eased) * 65;
  lines.forEach((line, i) => ctx.fillText(line, 110, startY + i * 100));
  ctx.globalAlpha = 1; ctx.fillStyle = s[3]; ctx.fillRect(110, startY + lines.length * 100 + 35, 76, 5);
}

async function recordCanvas() {
  const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = 960;
  const ctx = canvas.getContext('2d'); const fps = 24; const sceneFrames = Number(duration.value) * fps;
  const stream = canvas.captureStream(fps);
  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.start();
  const total = sceneFrames * 6;
  for (let n = 0; n < total; n++) {
    drawCanvasFrame(ctx, Math.min(5, Math.floor(n / sceneFrames)), (n % sceneFrames) / sceneFrames);
    if (n % 4 === 0) { const pct = Math.round((n / total) * 70); status.textContent = `● renderizando ${pct}%`; setProgress(pct, 'Renderizando frames…'); }
    await new Promise(resolve => setTimeout(resolve, 1000 / fps));
  }
  recorder.stop();
  await new Promise(resolve => recorder.onstop = resolve);
  return new Blob(chunks, { type: 'video/webm' });
}

async function encodeMp4(webm) {
  const ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }) => { const pct = 70 + progress * 30; status.textContent = `● convertendo ${Math.round(pct)}%`; setProgress(pct, 'Convertendo para MP4…'); });
  const base = './ffmpeg';
  await ffmpeg.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm') });
  await ffmpeg.writeFile('input.webm', await fetchFile(webm));
  await ffmpeg.exec(['-i', 'input.webm', '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', 'output.mp4']);
  const data = await ffmpeg.readFile('output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

let renderPromise = null;
async function generateMp4() {
  if (renderPromise) return renderPromise;
  const button = document.querySelector('#generate'); button.disabled = true; button.textContent = 'Gerando MP4…'; exportBox.classList.add('show'); setProgress(0, 'Preparando renderização…');
  renderPromise = (async () => {
    try { renderedVideo = await encodeMp4(await recordCanvas()); status.textContent = '● MP4 pronto'; setProgress(100, 'MP4 pronto para baixar'); document.querySelector('#download').textContent = 'Baixar MP4 ↓'; document.querySelector('#share').textContent = 'Compartilhar MP4 ↗'; return renderedVideo; }
    catch (error) { console.error(error); status.textContent = '● erro na renderização'; alert('Não foi possível gerar o MP4 neste navegador. Tente novamente em um computador ou navegador atualizado.'); return null; }
    finally { button.disabled = false; button.textContent = 'Gerar MP4'; renderPromise = null; }
  })();
  return renderPromise;
}

document.querySelector('#generate').onclick = generateMp4;
document.querySelector('#download').onclick = async () => { const video = renderedVideo || await generateMp4(); if (!video) return; const a = document.createElement('a'); a.href = URL.createObjectURL(video); a.download = 'frameforge-instagram.mp4'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
document.querySelector('#share').onclick = async () => { if (!renderedVideo) await generateMp4(); if (!renderedVideo) return; const file = new File([renderedVideo], 'frameforge-instagram.mp4', { type: 'video/mp4' }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ title: 'Minha animação FrameForge', text: 'Vídeo criado para Instagram', files: [file] }); else alert('O compartilhamento de arquivo não está disponível neste navegador. Gere o MP4 e use o botão Baixar.'); };
showFrame(0);
