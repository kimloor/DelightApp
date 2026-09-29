/* DelightApp Context Help V1
   Canonical source: /USER-MANUAL.md
   Deploy workflows copy it to /docs/USER-MANUAL.md.
*/
(function(){
  'use strict';

  var PAGE_HELP = {
    dashboard:{id:'dashboard',title:'ภาพรวม'},
    rooms:{id:'rooms',title:'ห้องพัก'},
    tenants:{id:'tenants',title:'ผู้เช่า'},
    bills:{id:'bills',title:'ค่าเช่า / บิล'},
    reports:{id:'reports',title:'รายงานสรุป'},
    importExport:{id:'import-export',title:'Import / Export'}
  };

  var manualText = '';
  var manualPromise = null;
  var FENCE = String.fromCharCode(96,96,96);

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function inlineMd(v){
    var x = esc(v);
    x = x.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    x = x.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    return x;
  }

  function renderMarkdown(md){
    var lines = String(md || '').replace(/\r\n/g,'\n').split('\n');
    var out = [];
    var list = '';
    var inCode = false;
    var code = [];

    function closeList(){
      if(!list) return;
      out.push(list === 'ol' ? '</ol>' : '</ul>');
      list = '';
    }

    lines.forEach(function(raw){
      var line = raw.replace(/\s+$/,'');

      if(line.trim().slice(0,3) === FENCE){
        closeList();
        if(inCode){
          out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');
          inCode = false;
          code = [];
        }else{
          inCode = true;
          code = [];
        }
        return;
      }

      if(inCode){
        code.push(raw);
        return;
      }

      if(!line.trim()){
        closeList();
        return;
      }

      var h = /^(#{2,5})\s+(.+)$/.exec(line.trim());
      if(h){
        closeList();
        var level = Math.min(5,Math.max(3,h[1].length+1));
        out.push('<h'+level+'>'+inlineMd(h[2])+'</h'+level+'>');
        return;
      }

      var bullet = /^-\s+(.+)$/.exec(line.trim());
      if(bullet){
        if(list !== 'ul'){
          closeList();
          out.push('<ul>');
          list = 'ul';
        }
        out.push('<li>'+inlineMd(bullet[1])+'</li>');
        return;
      }

      var numbered = /^\d+\.\s+(.+)$/.exec(line.trim());
      if(numbered){
        if(list !== 'ol'){
          closeList();
          out.push('<ol>');
          list = 'ol';
        }
        out.push('<li>'+inlineMd(numbered[1])+'</li>');
        return;
      }

      var quote = /^>\s?(.*)$/.exec(line.trim());
      if(quote){
        closeList();
        out.push('<div class="context-help-note">'+inlineMd(quote[1])+'</div>');
        return;
      }

      closeList();
      out.push('<p>'+inlineMd(line.trim())+'</p>');
    });

    if(inCode) out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');
    closeList();
    return out.join('');
  }

  function extractSection(md,helpId){
    var safeId = String(helpId || '').replace(/[.*+?^$()|[\]\\]/g,'\\$&');
    var marker = new RegExp('<!--\\s*help-id:\\s*'+safeId+'\\s*-->','i');
    var match = marker.exec(String(md || ''));
    if(!match) return '';
    var start = match.index + match[0].length;
    var rest = String(md || '').slice(start);
    var next = /<!--\s*help-id:/i.exec(rest);
    return (next ? rest.slice(0,next.index) : rest).trim();
  }

  async function fetchText(url,opts){
    var res = await fetch(url,opts || {});
    if(!res.ok) throw new Error('manual_http_'+res.status);
    return await res.text();
  }

  async function loadManual(){
    if(manualText) return manualText;
    if(manualPromise) return manualPromise;

    manualPromise = (async function(){
      var sources = [
        {url:'./docs/USER-MANUAL.md',opts:{cache:'no-store',credentials:'same-origin'}},
        {url:'https://raw.githubusercontent.com/kimloor/DelightApp/main/USER-MANUAL.md',opts:{cache:'no-store'}}
      ];
      var lastError = null;
      for(var i=0;i<sources.length;i++){
        try{
          var txt = await fetchText(sources[i].url,sources[i].opts);
          if(txt && txt.indexOf('help-id:') >= 0){
            manualText = txt;
            return txt;
          }
        }catch(err){
          lastError = err;
        }
      }
      throw lastError || new Error('manual_unavailable');
    })().finally(function(){ manualPromise = null; });

    return manualPromise;
  }

  function ensureUi(){
    if(typeof document === 'undefined') return null;
    var shell = document.getElementById('contextHelpShell');
    if(shell) return shell;

    shell = document.createElement('div');
    shell.id = 'contextHelpShell';
    shell.className = 'context-help-shell';
    shell.setAttribute('aria-hidden','true');
    shell.innerHTML =
      '<div class="context-help-backdrop" data-help-close></div>'+
      '<aside class="context-help-drawer" role="dialog" aria-modal="true" aria-labelledby="contextHelpTitle">'+
        '<div class="context-help-head">'+
          '<div><div class="context-help-kicker">วิธีใช้งาน</div><h2 id="contextHelpTitle">คู่มือ</h2></div>'+
          '<button type="button" class="context-help-close" data-help-close aria-label="ปิดคู่มือ">×</button>'+
        '</div>'+
        '<div class="context-help-source">ข้อมูลจาก <code>USER-MANUAL.md</code></div>'+
        '<div class="context-help-body" id="contextHelpBody"></div>'+
        '<div class="context-help-foot">'+
          '<button type="button" class="btn ghost small" data-help-full>ดูคู่มือฉบับเต็ม</button>'+
          '<button type="button" class="btn small" data-help-close>ปิด</button>'+
        '</div>'+
      '</aside>';

    document.body.appendChild(shell);
    return shell;
  }

  function setOpen(open){
    var shell = ensureUi();
    if(!shell) return;
    shell.classList.toggle('open',!!open);
    shell.setAttribute('aria-hidden',open ? 'false' : 'true');
    document.body.classList.toggle('context-help-open',!!open);
  }

  async function openHelp(helpId,title){
    var shell = ensureUi();
    if(!shell) return;
    var titleEl = shell.querySelector('#contextHelpTitle');
    var body = shell.querySelector('#contextHelpBody');
    titleEl.textContent = title || 'คู่มือ';
    body.innerHTML = '<div class="context-help-loading">กำลังโหลดคู่มือ…</div>';
    setOpen(true);

    try{
      var md = await loadManual();
      var section = extractSection(md,helpId);
      if(!section){
        body.innerHTML = '<div class="context-help-error">ยังไม่มีหัวข้อคู่มือสำหรับส่วนนี้</div>';
        return;
      }
      body.innerHTML = renderMarkdown(section);
      body.scrollTop = 0;
    }catch(err){
      body.innerHTML = '<div class="context-help-error">โหลดคู่มือไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่</div>';
    }
  }

  async function openFullManual(){
    var shell = ensureUi();
    if(!shell) return;
    var titleEl = shell.querySelector('#contextHelpTitle');
    var body = shell.querySelector('#contextHelpBody');
    titleEl.textContent = 'คู่มือการใช้งานทั้งหมด';
    body.innerHTML = '<div class="context-help-loading">กำลังโหลดคู่มือ…</div>';
    setOpen(true);

    try{
      var md = await loadManual();
      body.innerHTML = renderMarkdown(md.replace(/<!--\s*help-id:[^>]+-->/gi,''));
      body.scrollTop = 0;
    }catch(err){
      body.innerHTML = '<div class="context-help-error">โหลดคู่มือไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่</div>';
    }
  }

  function closeHelp(){
    setOpen(false);
  }

  function installPageHelpButton(page){
    if(typeof document === 'undefined') return;
    var cfg = PAGE_HELP[page];
    var head = document.querySelector('#main .page-head');
    if(!cfg || !head) return;

    head.classList.add('context-help-ready');
    var btn = head.querySelector('.page-context-help-btn');
    if(!btn){
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'context-help-btn page-context-help-btn';
      btn.textContent = '?';
      btn.setAttribute('aria-label','วิธีใช้งานหน้านี้');
      btn.title = 'วิธีใช้งานหน้านี้';
      head.appendChild(btn);
    }
    btn.dataset.helpId = cfg.id;
    btn.dataset.helpTitle = cfg.title;
  }

  if(typeof document !== 'undefined'){
    document.addEventListener('click',function(event){
      var close = event.target.closest('[data-help-close]');
      if(close){
        event.preventDefault();
        closeHelp();
        return;
      }

      var full = event.target.closest('[data-help-full]');
      if(full){
        event.preventDefault();
        openFullManual();
        return;
      }

      var trigger = event.target.closest('[data-help-id]');
      if(trigger){
        event.preventDefault();
        openHelp(trigger.dataset.helpId,trigger.dataset.helpTitle || trigger.title || 'คู่มือ');
      }
    });

    document.addEventListener('keydown',function(event){
      if(event.key === 'Escape') closeHelp();
    });
  }

  var api = {
    PAGE_HELP:PAGE_HELP,
    extractSection:extractSection,
    renderMarkdown:renderMarkdown,
    loadManual:loadManual,
    openHelp:openHelp,
    openFullManual:openFullManual,
    closeHelp:closeHelp,
    installPageHelpButton:installPageHelpButton
  };

  if(typeof window !== 'undefined'){
    window.DelightHelp = api;
    window.installPageHelpButton = installPageHelpButton;
  }
})();