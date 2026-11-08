/* Cathedral — procedural three.js nave, modelled after the reference photo */
window.initCathedral3D = function(canvas){
  'use strict';
  var T = window.THREE;
  if (!T || !canvas) return;

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.setClearColor(0x0b0806, 1);

  var scene = new T.Scene();
  scene.fog = new T.FogExp2(0x1a130c, 0.0095);

  var camera = new T.PerspectiveCamera(58, 1, 0.1, 260);
  camera.position.set(0, 3.8, 26);
  camera.lookAt(0, 8.5, -20);

  /* ---------- 材质 ---------- */
  function stoneTexture(){
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#b9a98a'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++){
      var v = 140 + Math.random() * 60;
      g.fillStyle = 'rgba(' + v + ',' + (v - 10) + ',' + (v - 28) + ',.22)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }
  var stex = stoneTexture();

  var stone = new T.MeshStandardMaterial({ color: 0x9a8462, roughness: 0.9, metalness: 0.02 });
  var stoneDark = new T.MeshStandardMaterial({ color: 0x5a4a37, roughness: 0.95, metalness: 0 });
  var stoneLight = new T.MeshStandardMaterial({ color: 0xb09873, roughness: 0.88, metalness: 0.03 });
  var gold = new T.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.42, metalness: 0.55, emissive: 0x2a1a06 });
  var dark = new T.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 });

  /* 地面：石砖 */
  function floorTexture(){
    var c = document.createElement('canvas'); c.width = c.height = 512;
    var g = c.getContext('2d');
    g.fillStyle = '#3b3127'; g.fillRect(0, 0, 512, 512);
    for (var y = 0; y < 8; y++){
      for (var x = 0; x < 8; x++){
        var v = 46 + Math.random() * 14;
        g.fillStyle = 'rgb(' + (v + 12) + ',' + (v + 4) + ',' + (v - 6) + ')';
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    }
    g.strokeStyle = 'rgba(12,9,6,.7)'; g.lineWidth = 3;
    for (var i = 0; i <= 8; i++){
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
    }
    var tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(4, 20);
    return tex;
  }

  var floor = new T.Mesh(
    new T.PlaneGeometry(22, 140),
    new T.MeshStandardMaterial({ map: floorTexture(), roughness: 0.92, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -40);
  scene.add(floor);

  /* ---------- 彩色玻璃窗 ---------- */
  var windowUniforms = [];
  function makeGlass(tint, lit){
    var u = { uTime: { value: 0 }, uTint: { value: new T.Color(tint) }, uLit: { value: lit } };
    windowUniforms.push(u);
    var mat = new T.ShaderMaterial({
      uniforms: u,
      side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec2 vUv;',
        'uniform float uTime; uniform vec3 uTint; uniform float uLit;',
        'void main(){',
        '  float w = abs(vUv.x - 0.5) * 2.0;',
        '  float top = 0.99 - 0.42 * pow(w, 1.7);',
        '  if (vUv.y > top) discard;',
        '  vec2 cell = vec2(floor(vUv.x * 5.0), floor(vUv.y * 9.0));',
        '  float id = mod(cell.x * 3.0 + cell.y * 7.0, 4.0);',
        '  vec3 c1 = vec3(0.16,0.30,0.85);',
        '  vec3 c2 = vec3(0.85,0.18,0.14);',
        '  vec3 c3 = vec3(1.00,0.72,0.24);',
        '  vec3 c4 = vec3(0.14,0.55,0.34);',
        '  vec3 c = id < 1.0 ? c1 : (id < 2.0 ? c2 : (id < 3.0 ? c3 : c4));',
        '  c *= (0.55 + 0.45 * sin(vUv.y * 6.0 + uTime * 0.6 + id));',
        '  c = mix(c, uTint, 0.25);',
        '  c *= uLit;',
        '  float gx = abs(fract(vUv.x * 5.0) - 0.5);',
        '  float gy = abs(fract(vUv.y * 9.0) - 0.5);',
        '  float lead = smoothstep(0.40, 0.5, max(gx, gy));',
        '  c = mix(c, vec3(0.02,0.015,0.01), lead);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    return mat;
  }

  var glassSide = makeGlass(0xff8a5a, 2.2);
  var glassCler = makeGlass(0xffc070, 2.6);
  var glassAltar = makeGlass(0xffd08a, 3.2);

  /* ---------- 中殿：柱列 ---------- */
  var bayZ = [6, -5, -16, -27, -38, -49, -60, -71, -82];
  var shaftGeo = new T.CylinderGeometry(0.72, 0.9, 10, 14);
  var baseGeo = new T.BoxGeometry(2.1, 0.8, 2.1);
  var capGeo = new T.BoxGeometry(2.2, 0.7, 2.2);

  bayZ.forEach(function(z){
    [-6, 6].forEach(function(x){
      var base = new T.Mesh(baseGeo, stoneDark); base.position.set(x, 0.4, z); scene.add(base);
      var shaft = new T.Mesh(shaftGeo, stone); shaft.position.set(x, 5.6, z); scene.add(shaft);
      var cap = new T.Mesh(capGeo, stoneLight); cap.position.set(x, 10.8, z); scene.add(cap);
      var cap2 = new T.Mesh(new T.BoxGeometry(2.6, 0.35, 2.6), stoneDark);
      cap2.position.set(x, 11.25, z); scene.add(cap2);
    });
  });

  /* ---------- 尖拱 ---------- */
  function archCurve(x, z1, z2){
    var pts = [];
    var zmid = (z1 + z2) / 2;
    for (var i = 0; i <= 24; i++){
      var t = i / 24;
      var y = 11.3 + 5.4 * (1 - Math.pow(Math.abs(2 * t - 1), 0.72));
      var z = z1 + (z2 - z1) * t;
      pts.push(new T.Vector3(x, y, z));
    }
    return new T.CatmullRomCurve3(pts);
  }

  for (var b = 0; b < bayZ.length - 1; b++){
    [-6, 6].forEach(function(x){
      [-0.36, 0, 0.36].forEach(function(off, k){
        var curve = archCurve(x + off, bayZ[b], bayZ[b + 1]);
        var geo = new T.TubeGeometry(curve, 28, k === 1 ? 0.34 : 0.2, 6, false);
        scene.add(new T.Mesh(geo, k === 1 ? stoneLight : stone));
      });
      // 拱上三层小拱（triforium）
      for (var q = 0; q < 3; q++){
        var tz = bayZ[b] + (bayZ[b + 1] - bayZ[b]) * (0.22 + q * 0.28);
        var arc = new T.Mesh(new T.TorusGeometry(0.85, 0.12, 5, 12, Math.PI), stoneLight);
        arc.position.set(x + 0.1, 14.4, tz);
        arc.rotation.y = Math.PI / 2;
        scene.add(arc);
      }
    });
  }

  /* ---------- 拱顶肋 ---------- */
  function rib(a, c, apexY){
    var mid = new T.Vector3(0, apexY, (a.z + c.z) / 2);
    var curve = new T.CatmullRomCurve3([a, mid, c]);
    var geo = new T.TubeGeometry(curve, 24, 0.22, 5, false);
    scene.add(new T.Mesh(geo, stoneLight));
  }
  for (var r = 0; r < bayZ.length - 1; r++){
    [-1, 1].forEach(function(side){
      var a = new T.Vector3(side * 6, 9.2, bayZ[r]);
      var c = new T.Vector3(side * 9.5, 9.2, bayZ[r + 1]);
      var m = new T.Vector3(side * 7.8, 10.6, (bayZ[r] + bayZ[r + 1]) / 2);
      scene.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([a, m, c]), 18, 0.16, 5, false), stoneLight));
      var a2 = new T.Vector3(side * 6, 9.2, bayZ[r]);
      var c2 = new T.Vector3(side * 9.5, 9.2, bayZ[r]);
      var m2 = new T.Vector3(side * 7.8, 10.9, bayZ[r]);
      scene.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([a2, m2, c2]), 16, 0.14, 5, false), stoneLight));
    });
  }
  for (var r = 0; r < bayZ.length - 1; r++){
    var z1 = bayZ[r], z2 = bayZ[r + 1];
    rib(new T.Vector3(6, 11.4, z1), new T.Vector3(-6, 11.4, z2), 16.4);
    rib(new T.Vector3(-6, 11.4, z1), new T.Vector3(6, 11.4, z2), 16.4);
    rib(new T.Vector3(6, 11.4, z2), new T.Vector3(-6, 11.4, z1), 16.4);
    rib(new T.Vector3(-6, 11.4, z2), new T.Vector3(6, 11.4, z1), 16.4);
  }

  /* ---------- 墙与高窗 ---------- */
  function wallWindow(x, y, z, w, h, mat, rotY){
    var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
  }

  [-1, 1].forEach(function(side){
    // 外侧墙
    var wall = new T.Mesh(new T.BoxGeometry(0.4, 26, 140), stoneDark);
    wall.position.set(side * 9.6, 13, -40);
    scene.add(wall);

    // 高侧窗（每跨一扇）
    for (var i = 0; i < bayZ.length - 1; i++){
      var z = (bayZ[i] + bayZ[i + 1]) / 2;
      wallWindow(side * 6.15, 17.2, z, 4.4, 8.4, glassCler, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      // 侧廊窗
      wallWindow(side * 9.35, 8.4, z, 3.6, 7.2, glassSide, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      // 窗间墙垛
      var pier = new T.Mesh(new T.BoxGeometry(0.6, 12, 2.2), stoneDark);
      pier.position.set(side * 6.3, 14, bayZ[i] + 0.9);
      scene.add(pier);
    }
  });

  /* ---------- 拱顶封面 ---------- */
  var vault = new T.Mesh(new T.BoxGeometry(13, 0.4, 140), dark);
  vault.position.set(0, 18.6, -40);
  scene.add(vault);

  /* ---------- 长椅与地毯 ---------- */
  var wood = new T.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.92 });
  var carpet = new T.Mesh(new T.PlaneGeometry(3, 74), new T.MeshStandardMaterial({ color: 0x3c1a16, roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.012, -40);
  scene.add(carpet);

  var seatGeo = new T.BoxGeometry(4.2, 0.36, 0.72);
  var backGeo = new T.BoxGeometry(4.2, 1.15, 0.16);
  for (var zz = -8; zz >= -60; zz -= 4){
    [-3.1, 3.1].forEach(function(x){
      var seat = new T.Mesh(seatGeo, wood); seat.position.set(x, 0.56, zz); scene.add(seat);
      var back = new T.Mesh(backGeo, wood); back.position.set(x, 1.14, zz - 0.4); scene.add(back);
    });
  }

  /* ---------- 中殿点光 ---------- */
  for (var li = 0; li < 4; li++){
    var pl = new T.PointLight(0xffc080, 0.85, 34, 2);
    pl.position.set(0, 6.5, -10 - li * 16);
    scene.add(pl);
  }

  /* ---------- 祭坛 ---------- */
  var altarZ = -86;
  for (var s = 0; s < 3; s++){
    var step = new T.Mesh(new T.BoxGeometry(12 - s * 2, 0.35, 6 - s * 1.2), stoneLight);
    step.position.set(0, 0.18 + s * 0.35, altarZ);
    scene.add(step);
  }
  var table = new T.Mesh(new T.BoxGeometry(5, 1.1, 1.8), stoneLight);
  table.position.set(0, 1.6, altarZ);
  scene.add(table);

  var reredos = new T.Mesh(new T.BoxGeometry(6, 4.6, 0.6), stone);
  reredos.position.set(0, 3.6, altarZ - 3.4);
  scene.add(reredos);

  [-3.2, 3.2].forEach(function(x){
    var col = new T.Mesh(new T.CylinderGeometry(0.34, 0.42, 5.4, 10), stoneLight);
    col.position.set(x, 3.1, altarZ - 3.3);
    scene.add(col);
    var cap = new T.Mesh(new T.BoxGeometry(1.0, 0.32, 1.0), gold);
    cap.position.set(x, 5.95, altarZ - 3.3);
    scene.add(cap);
  });

  var crossV = new T.Mesh(new T.BoxGeometry(0.25, 2.6, 0.25), gold);
  crossV.position.set(0, 6.2, altarZ - 2.8);
  scene.add(crossV);
  var crossH = new T.Mesh(new T.BoxGeometry(1.5, 0.25, 0.25), gold);
  crossH.position.set(0, 6.6, altarZ - 2.8);
  scene.add(crossH);

  // 大窗（祭坛后）
  var greatWindow = new T.Mesh(new T.PlaneGeometry(8, 13), glassAltar);
  greatWindow.position.set(0, 10.2, altarZ - 6.6);
  scene.add(greatWindow);

  // 祭坛蜡烛
  var candleMat = new T.MeshStandardMaterial({ color: 0xffe0a8, emissive: 0xffb050, emissiveIntensity: 2.2, roughness: 0.6 });
  for (var c = -3; c <= 3; c += 1.2){
    var cnd = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 0.9, 8), candleMat);
    cnd.position.set(c, 2.6, altarZ - 0.4);
    scene.add(cnd);
  }

  /* ---------- 光 ---------- */
  var hemi = new T.HemisphereLight(0xa9b6cf, 0x3a2c1e, 1.05);
  scene.add(hemi);
  scene.add(new T.AmbientLight(0x40342a, 0.9));

  var sun = new T.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(16, 30, -6);
  sun.target.position.set(0, 0, -36);
  scene.add(sun);
  scene.add(sun.target);

  var altarLight = new T.PointLight(0xffb060, 4.5, 60, 2);
  altarLight.position.set(0, 5.5, altarZ + 1);
  scene.add(altarLight);

  var naveLight = new T.PointLight(0xffc98a, 2.2, 50, 2);
  naveLight.position.set(0, 8, -24);
  scene.add(naveLight);

  /* ---------- 光柱 ---------- */
  var shaftMat = new T.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.05,
    blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
  });
  var shafts = [];
  [-1, 1].forEach(function(side){
    for (var i = 0; i < bayZ.length - 1; i++){
      var z = (bayZ[i] + bayZ[i + 1]) / 2;
      var shaft = new T.Mesh(new T.PlaneGeometry(5, 20), shaftMat.clone());
      shaft.position.set(side * 4.2, 8.5, z);
      shaft.rotation.set(0.55, side > 0 ? -0.55 : 0.55, side > 0 ? 0.2 : -0.2);
      scene.add(shaft);
      shafts.push(shaft);
    }
  });

  /* ---------- 尘埃 ---------- */
  var dustGeo = new T.BufferGeometry();
  var dustCount = 420, dpos = new Float32Array(dustCount * 3);
  for (var d = 0; d < dustCount; d++){
    dpos[d * 3] = (Math.random() - 0.5) * 14;
    dpos[d * 3 + 1] = Math.random() * 16;
    dpos[d * 3 + 2] = 8 - Math.random() * 84;
  }
  dustGeo.setAttribute('position', new T.BufferAttribute(dpos, 3));
  var dust = new T.Points(dustGeo, new T.PointsMaterial({
    color: 0xffd9a0, size: 0.07, transparent: true, opacity: 0.55,
    blending: T.AdditiveBlending, depthWrite: false
  }));
  scene.add(dust);

  /* ---------- 相机路线 ---------- */
  var zones = [26, 17, 2, -12, -26, -48, -62];
  var secs = Array.prototype.slice.call(document.querySelectorAll('main section'));
  var target = { z: 10 };
  function route(){
    var mid = window.scrollY + window.innerHeight * 0.55;
    var idx = -1;
    for (var i = 0; i < secs.length; i++){
      if (secs[i].offsetTop < mid) idx = i;
    }
    target.z = idx >= 0 ? zones[Math.min(idx, zones.length - 1)] : zones[0];
  }
  window.addEventListener('scroll', route, { passive: true });
  route();

  var mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', function(e){
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ---------- 时间光色 ---------- */
  var hour = new Date().getHours() + new Date().getMinutes() / 60;
  var phase = ((hour / 24) - 0.25 + 1) % 1;
  function paletteAt(t){
    var dawn = new T.Color(0xffd2a0), noon = new T.Color(0xfff3dc);
    var dusk = new T.Color(0xffb070), night = new T.Color(0x8fa6d8);
    t = (t % 1) * 4;
    var i = Math.floor(t), f = t - i;
    var a = i < 1 ? dawn : (i < 2 ? noon : (i < 3 ? dusk : night));
    var b = i < 1 ? noon : (i < 2 ? dusk : (i < 3 ? night : dawn));
    return a.clone().lerp(b, f);
  }
  var lightColor = paletteAt(phase);

  /* ---------- 尺寸 ---------- */
  function resize(){
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- 循环 ---------- */
  window.__cath3d = { scene: scene, camera: camera, renderer: renderer };

  var t0 = performance.now();
  var camZ = 26;
  function animate(){
    var now = performance.now();
    var t = (now - t0) / 1000;

    if (!window.__cathDebug){
    camZ += (target.z - camZ) * 0.035;
    var sway = Math.sin(t * 0.22) * 0.12;
    camera.position.x = sway + mouseX * 0.55;
    camera.position.y = 3.8 - mouseY * 0.18;
    camera.position.z = camZ;
    camera.lookAt(mouseX * 1.8, 7.4 - mouseY * 0.6, camZ - 18);
    }

    var bass = (window.AUDIO && window.AUDIO.bass) || 0;
    sun.intensity = 2.0 + bass * 1.4;
    sun.color.copy(lightColor);
    hemi.color.copy(lightColor).lerp(new T.Color(0x6b7a9a), 0.55);
    scene.fog.color.copy(new T.Color(0x120d09)).lerp(lightColor, 0.06);
    altarLight.intensity = 2.2 + Math.sin(t * 2.1) * 0.18 + bass * 0.8;

    for (var i = 0; i < windowUniforms.length; i++){
      windowUniforms[i].uTime.value = t;
      windowUniforms[i].uLit.value = 4.2 + Math.sin(t * 0.4 + i) * 0.35 + bass * 1.0;
    }
    for (var s = 0; s < shafts.length; s++){
      shafts[s].material.opacity = 0.035 + 0.02 * Math.sin(t * 0.3 + s) + bass * 0.05;
    }

    // 尘埃缓慢上升
    var pos = dust.geometry.attributes.position;
    for (var d = 0; d < dustCount; d++){
      var y = pos.array[d * 3 + 1] + 0.004 + bass * 0.01;
      if (y > 16){ y = 0.2; }
      pos.array[d * 3 + 1] = y;
    }
    pos.needsUpdate = true;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
};
