# Prism Mapper

Estúdio de **projection mapping** para celular/tablet, feito do zero. Você desenha formas, encaixa os cantos na superfície real e joga visuais gerados ou sua própria mídia dentro delas.

Todos os visuais são **gerados no aparelho por shader** (WebGL). Não há vídeos pagos, nenhum conteúdo do Lazy Lighting e nenhuma verificação de assinatura: nada para pagar.

## O que faz

- Formas de 4 cantos (retângulo) e elipse, com arraste de cantos e movimento da forma inteira.
- 14 visuais procedurais: plasma, túnel, grade neon, ondas, caleidoscópio, estrelas, anéis, feixe, pontos, arco-íris, degradê, cor sólida e calibração (mais mídia própria).
- Importação de **vídeo ou foto** do aparelho (fica só no seu celular).
- Opacidade, matiz, zoom, velocidade, cor, mistura normal/aditiva.
- Efeitos: caleidoscópio, pixelado, posterizar, linhas de varredura, deslizar, tile, girar padrão e zoom repetido.
- Cantos arredondados e rotação de conteúdo (0/90/180/270).
- Recorte (buraco escuro) nas elipses.
- Projeto salvo automaticamente no dispositivo, com exportar/importar `.json`.
- Modo **Projetar** em tela cheia, sem interface, para HDMI/espelhamento no projetor.
- Funciona offline (PWA).

## Rodar no Termux

```bash
cd ~/prism-mapper
node server.js
```

Abra no Chrome do aparelho: `http://localhost:8080`

Para usar em outra tela/rede, o servidor mostra o IP da rede (ex.: `http://192.168.x.x:8080`).

No Chrome: menu > **Adicionar à tela inicial** para abrir como app em tela cheia e funcionar offline.

## Gerar o APK Android

O Termux não tem o Android SDK (aapt2/gradle x86_64), então o APK é montado de graça no GitHub Actions:

1. Crie um repositório e envie esta pasta (a pasta `android/` já vai junto).
2. Abra **Actions > Android APK > Run workflow**.
3. Baixe o artifact `prism-mapper-apk`.

O workflow usa Node 22, Java 21 e Capacitor 8 (`cap sync` + Gradle 8.14, compileSdk 36). A `MainActivity` mantém a tela ligada e esconde as barras do sistema durante a projeção. Para assinar e publicar na Play Store, gere um keystore e troque `assembleDebug` por um build de release assinado.

## Estrutura

```
www/index.html          interface
www/css/style.css       estilo
www/js/app.js           WebGL, formas, visuais, projeto
www/sw.js               cache offline
www/manifest.webmanifest
server.js               servidor estático local
.github/workflows/      build do APK
```

## Limites (honestos)

- Sem rastreamento de mão/rosto, MIDI, áudio-reativo ou exportação de vídeo — esses recursos do original dependem de sensores/APIs específicas.
- Vídeos/fotos importados não entram no `.json` do projeto (só o nome); reimporte ao abrir em outro aparelho.
- Não é um clone do código do Lazy Lighting; é uma implementação independente com o mesmo tipo de função.
