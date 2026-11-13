/* Viewport-only, DOM-aligned gold lettering. Compatible with local Three.js r128. */
(function (global) {
  'use strict';

  function create(options) {
    const THREE = options.THREE || global.THREE;
    const host = options.host;
    if (!THREE || !host) throw new Error('SongbanLitText requires Three.js and a host.');
    const selector = options.selector || '[data-lit]';
    const entries = new Map(), active = new Set();
    const sharedGeometry = new THREE.PlaneGeometry(1, 1);
    let width = Math.max(1, global.innerWidth), height = Math.max(1, global.innerHeight);
    let disposed = false, contextLost = false, observer, sizes;
    let visibleCount = 0, renderFailed = false;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, width, height, 0, -10, 10);
    const viewport = { value: new THREE.Vector2(width, height) };
    const light = { value: new THREE.Vector3(width * .94, height * 1.08, Math.max(width, height) * .62) };
    const elapsed = { value: 0 };
    const maxTexture = Math.min(4096, renderer.capabilities.maxTextureSize);
    const hiddenProperties = ['color', '-webkit-text-fill-color', 'text-shadow'];

    function saveStyle(element) {
      return hiddenProperties.map(name => ({ name, value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name) }));
    }
    function hideDom(entry) {
      if (entry.hidden) return;
      entry.savedStyle = saveStyle(entry.element);
      entry.hadClass = entry.element.classList.contains('gpu-lit');
      entry.element.style.setProperty('color', 'transparent', 'important');
      entry.element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      entry.element.style.setProperty('text-shadow', 'none', 'important');
      entry.element.classList.add('gpu-lit');
      entry.hidden = true;
    }
    function showDom(entry) {
      if (!entry.hidden) return;
      entry.savedStyle.forEach(item => {
        if (item.value) entry.element.style.setProperty(item.name, item.value, item.priority);
        else entry.element.style.removeProperty(item.name);
      });
      if (!entry.hadClass) entry.element.classList.remove('gpu-lit');
      entry.hidden = false;
    }

    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        vUv=uv;
        vec4 world=modelMatrix*vec4(position,1.);
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `;
    const fragmentShader = `
      precision highp float;
      uniform sampler2D uGlyph;
      uniform vec2 uTexel,uViewport;
      uniform vec3 uLight;
      uniform vec4 uClip;
      uniform float uOpacity,uSoft,uPixelScale,uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      float glyph(vec2 at){return texture2D(uGlyph,at).a;}
      void main(){
        vec2 screen=vec2(vWorld.x,uViewport.y-vWorld.y);
        if(screen.x<uClip.x||screen.y<uClip.y||screen.x>uClip.z||screen.y>uClip.w)discard;
        float a=glyph(vUv);
        vec2 e=uTexel*max(1.,uPixelScale*.8);
        float left=glyph(vUv-vec2(e.x,0.));
        float right=glyph(vUv+vec2(e.x,0.));
        float below=glyph(vUv-vec2(0.,e.y));
        float above=glyph(vUv+vec2(0.,e.y));
        vec2 bevel=vec2(left-right,below-above);
        vec3 normal=normalize(vec3(bevel*1.7,1.));
        vec3 lightDirection=normalize(uLight-vWorld);
        vec3 halfDirection=normalize(lightDirection+vec3(0.,0.,1.));
        float diffuse=max(0.,dot(normal,lightDirection));
        float specular=pow(max(0.,dot(normal,halfDirection)),38.);
        float softSpecular=pow(max(0.,dot(normal,halfDirection)),8.);
        // A broad upper-right falloff: warm champagne in light, muted alloy in shade.
        // Screen-space normalization keeps that direction legible on mobile as well.
        vec2 lightOffset=(uLight.xy-vWorld.xy)/uViewport;
        float illumination=1.-smoothstep(.12,1.55,length(lightOffset));
        vec3 shadedGold=vec3(.77,.71,.60);
        vec3 champagne=vec3(.99,.935,.79);
        vec3 gold=mix(shadedGold,champagne,.23+.77*illumination);
        vec3 color=gold*(.80+.23*diffuse);
        vec3 ivory=vec3(.93,.92,.87)*(.96+.04*illumination);
        color=mix(color,ivory,uSoft);
        // A very slow, wide reflected light band gives the face a material response.
        // Its two-minute sway never behaves like a fast shine swept across the words.
        vec2 projected=vWorld.xy/uViewport;
        float reflectionCenter=.78+.18*sin(uTime*.052);
        float broadReflection=exp(-pow((dot(projected,vec2(.77,.48))-reflectionCenter)/.31,2.));
        vec3 reflectedLight=vec3(1.,.975,.90);
        float reflection=(specular*.19+softSpecular*.045+broadReflection*.055)*
          (.65+.35*illumination)*(1.-uSoft*.88);
        color+=reflectedLight*reflection;
        color+=reflectedLight*min(1.,length(bevel))*.095*diffuse*(1.-uSoft*.55);
        // A restrained warm scattering fringe, not an opaque text shadow.
        vec2 spread=uTexel*uPixelScale*2.5;
        float halo=(glyph(vUv+vec2(spread.x,0.))+glyph(vUv-vec2(spread.x,0.))+
          glyph(vUv+vec2(0.,spread.y))+glyph(vUv-vec2(0.,spread.y)))*.25;
        float alpha=clamp(a+halo*.075*(1.-a),0.,1.)*uOpacity;
        if(alpha<.003)discard;
        gl_FragColor=vec4(color,alpha);
      }
    `;

    function register(element) {
      if (entries.has(element)) return;
      // Nested marked elements would otherwise rasterize the same text twice.
      if (element.parentElement?.closest(selector)) return;
      const entry = { element, mesh: null, material: null, texture: null, dirty: true,
        hidden: false, pixelWidth: 0, pixelHeight: 0, padding: 8 };
      entries.set(element, entry);
      observer?.observe(element); sizes?.observe(element);
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width) active.add(entry);
    }
    function invalidate() {
      entries.forEach(entry => { entry.dirty = true; });
    }
    function refresh() {
      if (disposed) return;
      document.querySelectorAll(selector).forEach(register);
      entries.forEach((entry, element) => {
        if (!element.isConnected) {
          showDom(entry); entry.texture?.dispose(); entry.material?.dispose();
          if (entry.mesh) scene.remove(entry.mesh);
          observer?.unobserve(element); sizes?.unobserve(element);
          entries.delete(element); active.delete(entry);
        }
      });
      invalidate();
    }

    function rasterize(entry, rect, style) {
      const cssWidth = rect.width, cssHeight = rect.height;
      if (cssWidth < 1 || cssHeight < 1 || !entry.element.textContent.trim()) return false;
      const fontSize = parseFloat(style.fontSize) || 16;
      const padding = Math.max(6, Math.min(12, fontSize * .10));
      const textureWidth = cssWidth + padding * 2, textureHeight = cssHeight + padding * 2;
      const scale = Math.max(.5, Math.min(global.devicePixelRatio || 1, width < 600 ? 1.5 : 2,
        maxTexture / textureWidth, maxTexture / textureHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(textureWidth * scale));
      canvas.height = Math.max(1, Math.ceil(textureHeight * scale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return false;
      context.scale(scale, scale);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fillStyle = '#fff'; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
      if ('fontKerning' in context) context.fontKerning = 'none';
      const metrics = context.measureText('国Mg');
      const ascent = metrics.fontBoundingBoxAscent ?? fontSize * .88;
      const descent = metrics.fontBoundingBoxDescent ?? fontSize * .12;
      const walker = document.createTreeWalker(entry.element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node, painted = 0;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue;
        let index = 0;
        for (const original of text) {
          const length = original.length;
          range.setStart(node, index); range.setEnd(node, index + length); index += length;
          if (/\s/.test(original)) continue;
          const charRect = range.getBoundingClientRect();
          if (!charRect.width || !charRect.height) continue;
          let character = original;
          if (style.textTransform === 'uppercase') character = original.toUpperCase();
          else if (style.textTransform === 'lowercase') character = original.toLowerCase();
          const x = charRect.left - rect.left + padding;
          const y = charRect.top - rect.top + padding +
            (charRect.height - ascent - descent) * .5 + ascent;
          context.fillText(character, x, y); painted++;
        }
      }
      range.detach();
      if (!painted) return false;
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const prior = entry.texture;
      entry.texture = texture; entry.padding = padding;
      entry.pixelWidth = textureWidth; entry.pixelHeight = textureHeight;
      entry.contentWidth = cssWidth; entry.contentHeight = cssHeight;
      if (!entry.mesh) {
        const material = new THREE.ShaderMaterial({
          transparent: true, depthTest: false, depthWrite: false,
          uniforms: {
            uGlyph: { value: texture }, uTexel: { value: new THREE.Vector2(1 / canvas.width, 1 / canvas.height) },
            uViewport: viewport, uLight: light, uTime: elapsed, uClip: { value: new THREE.Vector4(0, 0, width, height) },
            uOpacity: { value: 1 }, uSoft: { value: entry.element.dataset.lit === 'soft' ? 1 : 0 },
            uPixelScale: { value: scale }
          }, vertexShader, fragmentShader
        });
        const mesh = new THREE.Mesh(sharedGeometry, material);
        mesh.frustumCulled = false; mesh.renderOrder = 1;
        scene.add(mesh); entry.mesh = mesh; entry.material = material;
      } else {
        entry.material.uniforms.uGlyph.value = texture;
        entry.material.uniforms.uTexel.value.set(1 / canvas.width, 1 / canvas.height);
        entry.material.uniforms.uPixelScale.value = scale;
      }
      prior?.dispose();
      entry.mesh.scale.set(textureWidth, textureHeight, 1);
      entry.dirty = false;
      return true;
    }

    function resize(nextWidth, nextHeight) {
      if (disposed) return;
      width = Math.max(1, nextWidth || global.innerWidth);
      height = Math.max(1, nextHeight || global.innerHeight);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, width < 600 ? 1.5 : 2));
      renderer.setSize(width, height, false);
      camera.right = width; camera.top = height; camera.updateProjectionMatrix();
      viewport.value.set(width, height);
      light.value.set(width * .94, height * 1.08, Math.max(width, height) * .62);
      invalidate();
    }

    function update(time, pointer) {
      if (disposed || contextLost || document.hidden || renderFailed) return;
      if (Number.isFinite(time)) elapsed.value = time;
      visibleCount = 0;
      const styleCache = new Map(), rectCache = new Map();
      const css = node => {
        if (!styleCache.has(node)) styleCache.set(node, global.getComputedStyle(node));
        return styleCache.get(node);
      };
      const bounds = node => {
        if (!rectCache.has(node)) rectCache.set(node, node.getBoundingClientRect());
        return rectCache.get(node);
      };
      const readyToHide = [];
      // Normalized pointer -1..1 or 0..1 inputs produce only a subtle lighting parallax.
      const px = Number.isFinite(pointer?.x) ? Math.max(-1, Math.min(1, pointer.x)) : 0;
      const py = Number.isFinite(pointer?.y) ? Math.max(-1, Math.min(1, pointer.y)) : 0;
      light.value.set(width * .94 + px * 16, height * 1.08 - py * 10, Math.max(width, height) * .62);
      entries.forEach(entry => { if (entry.mesh) entry.mesh.visible = false; });
      try {
        active.forEach(entry => {
          const element = entry.element;
          if (!element.isConnected) return;
          const rect = bounds(element);
          if (rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) return;
          const style = css(element);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          let opacity = 1, left = 0, top = 0, right = width, bottom = height;
          for (let node = element; node; node = node.parentElement) {
            const nodeStyle = css(node);
            opacity *= Number.parseFloat(nodeStyle.opacity) || (nodeStyle.opacity === '0' ? 0 : 1);
            if (nodeStyle.visibility === 'hidden' || nodeStyle.display === 'none') opacity = 0;
            if (node !== element && node !== document.body && node !== document.documentElement) {
              const clippedX = /hidden|clip|scroll|auto/.test(nodeStyle.overflowX);
              const clippedY = /hidden|clip|scroll|auto/.test(nodeStyle.overflowY);
              if (clippedX || clippedY) {
                const clip = bounds(node);
                if (clippedX) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
                if (clippedY) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
              }
            }
          }
          if (opacity < .002 || right <= left || bottom <= top) return;
          if (entry.dirty || Math.abs((entry.contentWidth || 0) - rect.width) > .75 ||
            Math.abs((entry.contentHeight || 0) - rect.height) > .75) {
            if (!rasterize(entry, rect, style)) { showDom(entry); return; }
          }
          const mesh = entry.mesh;
          mesh.position.set(rect.left - entry.padding + entry.pixelWidth * .5,
            height - rect.top + entry.padding - entry.pixelHeight * .5, 0);
          entry.material.uniforms.uOpacity.value = opacity;
          entry.material.uniforms.uClip.value.set(left, top, right, bottom);
          mesh.visible = true; visibleCount++;
          if (!entry.hidden) readyToHide.push(entry);
        });
        renderer.render(scene, camera);
        readyToHide.forEach(hideDom);
      } catch (cause) {
        renderFailed = true; entries.forEach(showDom); renderer.domElement.style.visibility = 'hidden';
        console.warn('Songban gold lettering fell back to readable DOM text.', cause);
      }
    }

    function contextLostHandler(event) {
      event.preventDefault(); contextLost = true;
      entries.forEach(showDom); renderer.domElement.style.visibility = 'hidden';
    }
    function contextRestoredHandler() {
      contextLost = false; renderFailed = false;
      renderer.domElement.style.visibility = ''; invalidate();
    }
    function dispose() {
      if (disposed) return;
      disposed = true; observer?.disconnect(); sizes?.disconnect();
      document.fonts?.removeEventListener('loadingdone', invalidate);
      renderer.domElement.removeEventListener('webglcontextlost', contextLostHandler);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestoredHandler);
      entries.forEach(entry => { showDom(entry); entry.texture?.dispose(); entry.material?.dispose(); });
      entries.clear(); active.clear(); sharedGeometry.dispose(); renderer.dispose(); renderer.domElement.remove();
    }

    observer = new IntersectionObserver(records => records.forEach(record => {
      const entry = entries.get(record.target);
      if (!entry) return;
      if (record.isIntersecting) active.add(entry);
      else { active.delete(entry); if (entry.mesh) entry.mesh.visible = false; }
    }), { rootMargin: '0px', threshold: 0 });
    sizes = new ResizeObserver(records => records.forEach(record => {
      const entry = entries.get(record.target); if (entry) entry.dirty = true;
    }));
    renderer.domElement.addEventListener('webglcontextlost', contextLostHandler);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestoredHandler);
    document.fonts?.addEventListener('loadingdone', invalidate);
    document.fonts?.ready.then(() => { if (!disposed) invalidate(); });
    refresh(); resize(width, height);
    return { resize, update, dispose, refresh,
      getState: () => ({ elements: entries.size, active: visibleCount, contextLost, fallback: renderFailed }) };
  }
  global.SongbanLitText = { create };
})(window);
