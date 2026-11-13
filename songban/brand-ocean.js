/* Songban brand ocean — Three.js r128, procedural geometry / lighting, no assets.
 * One quiet blue sea and a single golden source above the right-hand horizon.
 * The owner drives animation so this module never starts a second RAF loop. */
(function (global) {
  'use strict';

  function create(options) {
    const THREE = options.THREE || global.THREE;
    const host = options.host;
    if (!THREE || !host) throw new Error('SongbanOcean needs Three.js and a host element.');
    let disposed = false, contextLost = false, reduced = Boolean(options.reducedMotion);
    let width = 1, height = 1;
    const renderer = new THREE.WebGLRenderer({
      alpha: false, antialias: false, powerPreference: 'high-performance'
    });
    renderer.setClearColor('#142438', 1);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'brand-ocean-canvas';
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uTime: { value: 0 }, uAspect: { value: 1 }, uScroll: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uBlue: { value: new THREE.Color('#6699CC') }
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms, depthTest: false, depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime,uAspect,uScroll;
        uniform vec2 uPointer;
        uniform vec3 uBlue;

        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

        // A slow nested current advects all wave scales together. Soft eddies
        // stretch and gather the surface, rather than sliding rigid sine bands.
        // This only changes motion coordinates; the original blue / gold
        // shading below stays intact.
        vec2 liquidFlow(vec2 world,float t,float detail){
          vec2 p=world*.145+vec2(t*.025,-t*.033);
          vec2 current=vec2(
            sin(p.y*.91+sin(p.x*.62)*.72+t*.071),
            cos(p.x*.83+sin(p.y*.54)*.68-t*.059)
          );
          vec2 q=p+current*.52;
          vec2 eddy=vec2(
            sin(q.y*1.41+q.x*.36-t*.087),
            cos(q.x*1.27-q.y*.28+t*.073)
          );
          // A broad current stays visible in the near water. Its perturbation
          // fades far away so the horizon remains tranquil and alias-free.
          float strength=.35+detail*.65;
          vec2 drift=vec2(t*.055,-t*.13);
          return world+drift+(current*1.35+eddy*.68)*strength;
        }

        // Analytic wave gradients avoid extra normal-map texture reads. The long
        // swells and fine capillary waves travel in different directions.
        vec2 waveGradient(vec2 p,float t,float detail){
          vec2 d=vec2(0.);
          d+=vec2(.31,.24)*cos(dot(p,vec2(.31,.24))-t*.22)*.31;
          d+=vec2(-.19,.43)*cos(dot(p,vec2(-.19,.43))-t*.18+1.7)*.23;
          d+=vec2(.73,.51)*cos(dot(p,vec2(.73,.51))-t*.31+2.4)*.12;
          d+=vec2(-1.27,.88)*cos(dot(p,vec2(-1.27,.88))+t*.43)*.045*detail;
          d+=vec2(2.81,1.43)*cos(dot(p,vec2(2.81,1.43))-t*.61+1.1)*.014*detail;
          d+=vec2(-4.12,3.17)*cos(dot(p,vec2(-4.12,3.17))-t*.73)*.004*detail;
          return d;
        }

        vec3 sky(vec3 ray,vec3 sun){
          float elevation=max(0.,ray.y);
          vec3 low=uBlue*vec3(.33,.36,.39);
          vec3 high=uBlue*vec3(.105,.135,.18);
          vec3 color=mix(low,high,smoothstep(0.,.45,elevation));
          float nearSun=max(0.,dot(ray,sun));
          // The actual source sits just outside the composition. Only the broad
          // aureole is seen; no bright disk competes with the illuminated type.
          color+=vec3(1.,.76,.43)*pow(nearSun,14.)*.075;
          color+=vec3(1.,.86,.61)*pow(nearSun,65.)*.065;
          return color;
        }

        void main(){
          vec2 uv=vUv;
          float t=uTime;
          // .58 in bottom-origin UV is 42% down from the top of the viewport.
          float horizon=.58+sin(uScroll*3.14159)*.012;
          vec2 screen=vec2((uv.x-.5)*uAspect,(uv.y-horizon)*.91);
          screen+=uPointer*vec2(.005,.003);
          vec3 ray=normalize(vec3(screen,-1.));
          vec3 sun=normalize(vec3(.47*uAspect,.41,-1.));
          vec3 color=sky(ray,sun);

          if(ray.y<0.){
            float distance=2.15/max(.0025,-ray.y);
            vec2 world=vec2(ray.x,ray.z)*distance;
            world.y-=uScroll*3.5;
            float detail=1.-smoothstep(22.,100.,distance);
            vec2 flowingWorld=liquidFlow(world,t,detail);
            vec2 slope=waveGradient(flowingWorld,t,detail);
            vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
            vec3 view=-ray;
            vec3 halfway=normalize(sun+view);
            float facing=clamp(dot(normal,view),0.,1.);
            float fresnel=.055+.64*pow(1.-facing,4.);
            float diffuse=max(0.,dot(normal,sun));

            vec3 body=uBlue*(.19+diffuse*.13);
            // Facing wave slopes carry a quiet lapis sheen.
            body+=uBlue*pow(max(0.,normal.z*.6+normal.x*.25+.22),2.)*.12;
            vec3 reflection=sky(reflect(ray,normal),sun);
            color=mix(body,reflection,fresnel*.7);

            float alignment=max(0.,dot(normal,halfway));
            float broad=pow(alignment,45.);
            float glint=pow(alignment,210.);
            float broken=.58+.42*sin(flowingWorld.y*2.1+slope.x*9.-t*.3);
            vec3 gold=vec3(.98,.75,.42);
            color+=gold*(broad*.16+glint*.56)*(.6+fresnel)*broken;

            // A softer reflected light path remains readable between glints.
            // Its width widens toward the viewer, as it would across open water.
            float depth=clamp((horizon-uv.y)/horizon,0.,1.);
            float pathCenter=.84+depth*.08;
            float pathWidth=.035+depth*.13;
            float path=exp(-pow((uv.x-pathCenter)/pathWidth,2.));
            float ripples=.5+.5*sin(flowingWorld.y*(1.6+detail*.9)+slope.x*13.-t*.27);
            float gleam=pow(ripples,8.)*path;
            color+=gold*gleam*(.036+depth*.025);

            float mist=1.-exp(-distance*.012);
            vec3 horizonColor=uBlue*vec3(.32,.35,.39);
            horizonColor+=gold*exp(-pow((uv.x-.88)/.22,2.))*.035;
            color=mix(color,horizonColor,mist*.75);
          }

          // Feather the sea/sky boundary so it suggests infinite distance.
          float horizonMist=exp(-abs(uv.y-horizon)*65.);
          color+=uBlue*horizonMist*.023;

          // Sparse atmospheric scattering from the same upper-right source.
          vec2 source=vec2(1.14,1.18);
          vec2 fromSource=(uv-source)*vec2(uAspect,1.);
          vec2 axis=normalize(vec2(-.74*uAspect,-1.));
          float along=dot(fromSource,axis);
          float across=abs(fromSource.x*axis.y-fromSource.y*axis.x);
          float beam=exp(-pow(across/(.12+max(0.,along)*.13),2.));
          float shafts=.65+.35*sin(atan(fromSource.y,fromSource.x)*45.+.3);
          color+=vec3(1.,.79,.49)*beam*shafts*.019*exp(-max(0.,along)*.35);

          // Keep the left-hand reading area quiet without painting a second
          // black overlay; the requested 10% overlay belongs to the page CSS.
          float edges=smoothstep(.25,.82,length((uv-.5)*vec2(.8,.8)));
          color*=1.-edges*.12;
          color+=(hash(gl_FragCoord.xy)-.5)/255.;
          gl_FragColor=vec4(color,1.);
        }
      `
    });
    const sea = new THREE.Mesh(geometry, material);
    sea.frustumCulled = false;
    scene.add(sea);

    function onLost(event) {
      event.preventDefault(); contextLost = true;
      host.dataset.oceanState = 'context-lost';
    }
    function onRestored() {
      contextLost = false;
      host.dataset.oceanState = 'ready';
      resize(width, height);
      renderer.render(scene, camera);
    }
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    function resize(nextWidth, nextHeight) {
      if (disposed) return;
      width = Math.max(1, Number(nextWidth) || host.clientWidth || 1);
      height = Math.max(1, Number(nextHeight) || host.clientHeight || 1);
      if (contextLost) return;
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, width < 600 ? 1.5 : 1.6));
      renderer.setSize(width, height, false);
      uniforms.uAspect.value = width / height;
    }
    function update(time, scrollProgress, pointer) {
      if (disposed || contextLost) return;
      uniforms.uTime.value = reduced ? 0 : Math.max(0, Number(time) || 0);
      uniforms.uScroll.value = Math.max(0, Math.min(1, Number(scrollProgress) || 0));
      // Pointer contract: normalized around zero, normally [-.5, .5].
      const x = pointer && Number.isFinite(pointer.x) ? pointer.x : 0;
      const y = pointer && Number.isFinite(pointer.y) ? pointer.y : 0;
      uniforms.uPointer.value.set(reduced ? 0 : Math.max(-1, Math.min(1, x)),
        reduced ? 0 : Math.max(-1, Math.min(1, y)));
      renderer.render(scene, camera);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      geometry.dispose(); material.dispose(); renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.oceanState;
    }

    resize(host.clientWidth, host.clientHeight);
    update(0, 0, null);
    host.dataset.oceanState = 'ready';
    return { resize, update, dispose,
      setReducedMotion(value) { reduced = Boolean(value); } };
  }

  global.SongbanOcean = { create };
})(window);
