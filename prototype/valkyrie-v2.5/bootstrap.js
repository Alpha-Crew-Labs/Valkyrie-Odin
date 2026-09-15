(function(){
  function releaseBoot(){
    var boot=document.getElementById('boot');
    if(!boot){return;}
    boot.classList.add('off');
    window.setTimeout(function(){
      if(boot && boot.classList.contains('off')){boot.style.display='none';}
    },650);
  }

  function runtimeFlag(message){
    try{
      var afd=document.getElementById('afd');
      if(!afd){return;}
      var row=document.createElement('div');
      row.className='n0';
      row.innerHTML='<b>RUNTIME</b> '+message;
      afd.appendChild(row);
    }catch(_err){}
  }

  window.addEventListener('error',function(event){
    console.error('[VALKYRIE runtime]',event.error||event.message);
    releaseBoot();
    runtimeFlag('DEGRADED · CHECK CONSOLE');
  });

  window.addEventListener('unhandledrejection',function(event){
    console.error('[VALKYRIE promise]',event.reason);
    releaseBoot();
    runtimeFlag('DEGRADED · ASYNC ERROR');
  });

  window.addEventListener('DOMContentLoaded',function(){
    // Hard fail-safe: the cinematic intro may never trap the user on a black screen.
    window.setTimeout(releaseBoot,3200);
  });

  window.VALKYRIE_RELEASE_BOOT=releaseBoot;
})();
