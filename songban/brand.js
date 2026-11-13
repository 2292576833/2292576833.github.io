(function (global) {
  'use strict';
  const preference = global.matchMedia('(prefers-reduced-motion: reduce)');
  const button = document.getElementById('motion-control');
  const progressBar = document.getElementById('reading-progress');
  const chapters = [...document.querySelectorAll('.chapter')];
  const pointer = { x: 0, y: 0 };
  let ocean, letters, motion, raf = 0, previous = null, time = 0, paused = false, disposed = false;
  let rebuildTimer = 0, reduced = preference.matches, lastChapter = -1;
  let interactiveUntil = 0;
  const listeners = [];
  const listen = (node, event, fn, options) => { node.addEventListener(event, fn, options); listeners.push(() => node.removeEventListener(event, fn, options)); };

  function configureMotion() {
    motion?.revert();
    if (!global.gsap || !global.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    motion = gsap.context(() => {
      if (reduced) return;
      gsap.timeline({defaults:{ease:'power3.out',duration:1.7}})
        .from('.intro-item',{y:34,opacity:0,stagger:.16},.15)
        .from('.site-header',{y:-12,opacity:0,duration:1.3},.2)
        .from('.hero-caption',{opacity:0,duration:1.4},1.1);
      gsap.utils.toArray('.reveal').forEach(element => {
        gsap.fromTo(element,{y:50,opacity:.12},{y:0,opacity:1,ease:'none',
          scrollTrigger:{trigger:element,start:'top 94%',end:'top 67%',scrub:.65}});
      });
      const lines = gsap.utils.toArray('.belief-line');
      const narrative = gsap.timeline({scrollTrigger:{trigger:'#belief',start:'top 25%',end:'bottom bottom',scrub:1}});
      lines.forEach((line,index) => narrative.fromTo(line,{opacity:.20,y:18},{opacity:1,y:0,duration:1,ease:'sine.out'},index*.75));
      gsap.to('.hero-content',{y:-65,opacity:0,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom 12%',scrub:1}});
    });
    ScrollTrigger.refresh();
  }
  function requestFrame() { if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed || document.hidden) { previous = null; return; }
    const dt = previous === null ? 0 : Math.min((now - previous) / 1000,.05); previous = now;
    if (!paused && !reduced) time += dt;
    const maxScroll = Math.max(1,document.documentElement.scrollHeight-global.innerHeight);
    const progress = Math.max(0,Math.min(1,global.scrollY/maxScroll));
    try { ocean?.update(time,progress,pointer); } catch(cause) { ocean?.dispose(); ocean=null; console.warn('Ocean fallback enabled',cause); }
    try { letters?.update(time,pointer); } catch(cause) { letters?.dispose(); letters=null; console.warn('Text fallback enabled',cause); }
    progressBar.style.transform='scaleY('+progress+')';
    let current=0;
    chapters.forEach((chapter,index)=>{const rect=chapter.getBoundingClientRect();if(rect.top<global.innerHeight*.5)current=index;});
    if(current!==lastChapter){
      lastChapter=current;
      document.getElementById('chapter-number').textContent=String(current+1).padStart(2,'0');
      document.getElementById('chapter-name').textContent=chapters[current].dataset.chapter;
    }
    if ((!paused && !reduced) || now < interactiveUntil) requestFrame();
  }
  function resize(){
    if(disposed)return;
    ocean?.resize(global.innerWidth,global.innerHeight);
    clearTimeout(rebuildTimer);
    rebuildTimer=setTimeout(()=>{letters?.resize(global.innerWidth,global.innerHeight);global.ScrollTrigger?.refresh();requestFrame();},180);
    requestFrame();
  }
  function setPaused(value){paused=value;previous=null;interactiveUntil=performance.now()+2200;button.setAttribute('aria-pressed',String(value));button.setAttribute('aria-label',value?'播放光影':'暂停光影');button.title=value?'播放光影':'暂停光影';requestFrame();}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);clearTimeout(rebuildTimer);
    listeners.forEach(remove=>remove());motion?.revert();letters?.dispose();ocean?.dispose();
  }
  async function initialize(){
    try { if(global.THREE&&global.SongbanOcean)ocean=SongbanOcean.create({THREE:global.THREE,host:document.getElementById('ocean'),reducedMotion:reduced}); }
    catch(cause){console.warn('Using ocean fallback',cause);}
    await document.fonts.ready;
    if(disposed)return;
    configureMotion();
    try { if(global.THREE&&global.SongbanLitText)letters=SongbanLitText.create({THREE:global.THREE,host:document.getElementById('letter-light'),selector:'[data-lit]'}); }
    catch(cause){console.warn('Using readable text fallback',cause);}
    listen(global,'resize',resize);
    listen(global,'scroll',()=>{interactiveUntil=performance.now()+1400;requestFrame();},{passive:true});
    listen(global,'pointermove',event=>{if(event.pointerType!=='touch'&&!paused&&!reduced){pointer.x=event.clientX/global.innerWidth-.5;pointer.y=.5-event.clientY/global.innerHeight;requestFrame();}},{passive:true});
    listen(document,'pointerleave',()=>{pointer.x=0;pointer.y=0;});
    listen(button,'click',()=>setPaused(!paused));
    listen(document,'visibilitychange',()=>{previous=null;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else requestFrame();});
    listen(preference,'change',()=>{reduced=preference.matches;ocean?.setReducedMotion(reduced);configureMotion();letters?.refresh();requestFrame();});
    listen(global,'pagehide',event=>{if(!event.persisted)dispose();});
    global.SongbanBrand={getState:()=>({paused,reduced,time,lighting:letters?.getState(),progress:global.scrollY/Math.max(1,document.documentElement.scrollHeight-global.innerHeight)}),dispose};
    resize();
    if (global.location.hash && global.location.hash !== '#top') {
      const anchor = document.getElementById(decodeURIComponent(global.location.hash.slice(1)));
      if (anchor) { anchor.scrollIntoView({behavior:'instant',block:'start'});global.ScrollTrigger?.update();interactiveUntil=performance.now()+1800; }
    }
    requestFrame();
  }
  initialize();
})(window);
