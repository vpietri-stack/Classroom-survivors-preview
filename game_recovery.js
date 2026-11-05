// Functional game progress, separate from diagnostics. Gameplay never awaits a save.
(function (w) {
    'use strict';
    const core = w.GameResumeCore;
    let owner = '', active = false, restoring = false, offer = null, snapshot = null, version = 0;
    let action = null, supersedes = null, busy = false, blocked = false, generation = 0, timer = null;
    let known = [], lastSaved = 0, dialog = null, menuContent = null, observed = false, choice = 0, handshake = false, brandNew = false, finalAt = 0, finalState = '';
    const writer = uid(), scope = location.pathname.replace(/index\.html$/i, '').replace(/\/+$/, '').replace(/[^a-z0-9]/gi, '_');
    function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10); }
    function enabled() { return !!core && typeof GAME_RESUME_ENABLED !== 'undefined' && GAME_RESUME_ENABLED
        && !(typeof isTestMode !== 'undefined' && isTestMode); }
    function user() { return typeof authActiveUser === 'undefined' ? null : authActiveUser; }
    function own() { return enabled() && user() && user().id === owner && !['teacher','admin','BM'].includes(user().role); }
    function key() { return 'csGameResume_v1_' + scope + '_' + owner; }
    function read() { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (_) { return null; } }
    function write(value) { try { localStorage.setItem(key(), JSON.stringify(value)); return true; } catch (_) { return false; } }
    function remember(id) { if (core.id(id)) known = Array.from(new Set(known.concat(id))).slice(-40); }
    function menu() {
        for(const button of [document.getElementById('game-resume-button'),document.getElementById('game-resume-selection-button')]){
        if(button){const hidden=!own()||!offer;if(button.classList.contains('hidden')!==hidden)button.classList.toggle('hidden',hidden);const label='继续上次游戏'+(offer?'（'+(offer.game==='gomoku'?'五子棋':'UNO')+'）':'');if(button.textContent!==label)button.textContent=label;}
        }
    }
    function restoreMenuContent() {
        const u = user();
        if (u && u.book && u.unit !== undefined && u.page !== undefined)
            selectedClassContent = { ...(menuContent || {}), book: u.book, unit: u.unit, page: u.page };
        else if (menuContent) selectedClassContent = JSON.parse(JSON.stringify(menuContent));
        if(typeof loadContent==='function'&&typeof selectedClassContent!=='undefined')loadContent(selectedClassContent);
    }
    async function request(body) {
        if (!own()) throw Error('Account changed');
        const ctrl = new AbortController(), deadline = setTimeout(() => ctrl.abort(), 4000);
        try {
            const r = await apiFetch(API_BASE_URL + '/gameResume', { method: body ? 'POST' : 'GET', cache: 'no-store',
                signal: ctrl.signal, keepalive: !!body, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
            const data = await r.json().catch(() => ({}));
            return { status: r.status, ok: r.ok, data };
        } finally { clearTimeout(deadline); }
    }
    function schedule(ms) { clearTimeout(timer); if (own() && action && !blocked) timer = setTimeout(() => { timer = null; flush(); }, ms == null ? 5000 : ms); }
    async function flush() {
        if (!own() || busy || blocked || !action || !snapshot) return;
        const ticket=generation, initialRun=snapshot.runId;
        busy=true;lastSaved=Date.now();
        try {
            if(handshake && ['begin','claim'].includes(action)) {
                const r=await request();
                if(ticket!==generation||!own()||snapshot.runId!==initialRun)return;
                if(!r.ok||!r.data.enabled)throw Error('Backup unavailable');
                version=r.data.version||0;
                if(action==='complete')supersedes=r.data.runId||supersedes;
                if(action!=='complete') {
                    if(brandNew&&r.data.completed){remember(r.data.completed.runId);snapshot.knownCompletions=known.slice();}
                    if(!core.pending(snapshot,r.data.completed)||r.data.closedRunId===snapshot.runId) {
                        active=false;offer=null;action=null;GameRuntime.suspend();
                        document.getElementById('startScreen').classList.remove('hidden');restoreMenuContent();menu();return;
                    }
                    action=r.data.runId===snapshot.runId?'claim':'begin';supersedes=r.data.runId||null;
                }
                handshake=false;
            }
            if(!action||!snapshot)return;
            const sentAction=action,sent=JSON.parse(JSON.stringify(snapshot));
            const body={action:sentAction,runId:sent.runId,baseVersion:version,supersedesRunId:supersedes,
                ...(sentAction==='complete'?{}:{snapshot:sent})};
            const r=await request(body);
            if(ticket!==generation||!own())return;
            if(r.status===409) {
                if(snapshot.runId!==sent.runId)return;
                blocked=true;
                if(active&&typeof showStudyNotice==='function')showStudyNotice('这次游戏已在其他页面更新。本页进度仍保留在这台设备上。');
                return;
            }
            if(r.status===410) {
                if(snapshot.runId!==sent.runId)return;
                if(active&&w.GameRuntime)GameRuntime.suspend();active=false;offer=null;action=null;
                document.getElementById('startScreen').classList.remove('hidden');restoreMenuContent();
                write({status:'completed',runId:sent.runId,known});menu();return;
            }
            if(!r.ok||r.data.enabled===false)throw Error('Backup unavailable');
            version=r.data.version||version;
            if(snapshot.runId===sent.runId&&action===sentAction)action=snapshot.seq>sent.seq?'checkpoint':null;
            const saved=read();if(saved&&saved.runId===sent.runId){saved.version=version;saved.known=known.slice();if(saved.snapshot)saved.snapshot.knownCompletions=known.slice();write(saved);}
        }catch(_){if(ticket===generation)schedule(30000);}
        finally{busy=false;if(own()&&action&&!blocked&&!timer)schedule(active?undefined:0);}
    }
    function capture() {
        if (!own() || !active || restoring || !w.GameRuntime || !GameRuntime.isActive()) return;
        try {
            const next = { ...GameRuntime.capture(), schema: 1, owner, runId: snapshot.runId, writerId: writer,
                seq: snapshot.seq + 1, createdAt: snapshot.createdAt, updatedAt: Date.now(), knownCompletions: known.slice() };
            if (!core.validate(next, owner)) return;
            const previousPosition = snapshot.state && snapshot.state.turn;
            const position = next.state.turn;
            snapshot = next; offer = next;
            write({ status:'active', runId:next.runId, snapshot:next, version, known });
            if (!action) action = 'checkpoint';
            // Frequent input saves are local; remote writes are coalesced, at most once/5s.
            if (!busy && !timer) schedule(position !== previousPosition ? 200 : Math.max(200, 5000 - (Date.now() - lastSaved)));
            menu();
        } catch (_) { /* optional persistence must not interrupt an exercise */ }
    }
    function begin() {
        if (!own()) return;
        choice++;closePrompt();handshake=true;brandNew=true;
        supersedes = offer && offer.runId || null;
        const runId = w.PracticeTelemetry && PracticeTelemetry.current() || 'game_' + uid();
        snapshot = { runId, createdAt: Date.now(), seq: 0 };
        active = true; blocked = false; restoring = false; action = 'begin';
        capture(); schedule(0);
    }
    function pause() { if(active){capture();active=false;restoreMenuContent();}menu();schedule(0); }
    function decorate(event) {
        if (!own() || !snapshot || !active || event.mode !== 'game' && event.sessionType !== snapshot.game) return;
        if (event.type === 'session') {
            event.eventId = 'se_game_' + snapshot.runId;
            event.data = { ...event.data, gameRunId: snapshot.runId, gameContent: snapshot.content };
        } else if (event.type === 'exercise' && !/^speech_/.test(event.exerciseType)) {
            const identity = JSON.stringify([GameRuntime.questionId(),event.exerciseType,event.itemDetails]);
            let hash = 2166136261; for (let i=0;i<identity.length;i++) hash = Math.imul(hash ^ identity.charCodeAt(i),16777619);
            event.eventId = 'ex_game_' + snapshot.runId + '_' + (hash >>> 0).toString(36);
        }
    }
    function complete(event) {
        if (!own() || !snapshot || event.sessionType !== snapshot.game || !active) return;
        remember(snapshot.runId); active = false; offer = null; action = 'complete';
        write({ status:'completed', runId:snapshot.runId, known:known.slice(), version });
        closePrompt(); restoreMenuContent(); menu(); schedule(0);
    }
    function closePrompt() { if (dialog) dialog.remove(); dialog = null; }
    function prompt() {
        if (!own() || !offer || active) return;
        closePrompt(); if (w.PreviewNotes) PreviewNotes.close();
        dialog = document.createElement('section'); dialog.id = 'game-resume-dialog'; dialog.className = 'study-resume-dialog';
        dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','game-resume-question');
        const card=document.createElement('div'), heading=document.createElement('h2'), text=document.createElement('p'), buttons=document.createElement('div');
        card.className='study-resume-card'; heading.id='game-resume-question'; heading.textContent='继续上次游戏？';
        text.textContent='看起来你上次的游戏还没有结束，要继续吗？';
        const yes=document.createElement('button'),no=document.createElement('button');yes.type=no.type='button';
        yes.id='game-resume-yes';no.id='game-resume-no';yes.textContent='是，继续游戏';no.textContent='否，返回主菜单';
        yes.className='game-btn bg-green-600';no.className='game-btn bg-gray-500';
        yes.onclick=()=>resume();no.onclick=()=>{choice++;closePrompt();menu();document.getElementById('game-resume-button')?.focus();};
        buttons.append(yes,no);card.append(heading,text,buttons);dialog.append(card);document.body.append(dialog);yes.focus();
        dialog.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();no.click();}if(e.key==='Tab'){e.preventDefault();(document.activeElement===yes?no:yes).focus();}};
    }
    async function resume() {
        if (!own() || !offer || active) return false;
        const ticket=generation, attempt=++choice, button=document.getElementById('game-resume-yes'); if(button){button.disabled=true;button.textContent='正在恢复游戏…';}
        let chosen=offer, remoteKnown=false, remoteRun=null;
        try {
            const r=await request();
            if(ticket!==generation||attempt!==choice||!own())return false;
            if(r.ok&&r.data.enabled){
                version=r.data.version||0;remoteKnown=true;remoteRun=r.data.runId||r.data.snapshot&&r.data.snapshot.runId||null;
                if(!core.pending(chosen,r.data.completed)||r.data.closedRunId===chosen.runId) { remember(r.data.completed&&r.data.completed.runId);offer=null;closePrompt();menu();return false; }
                const remote=r.data.snapshot;
                if(remote&&remote.runId===chosen.runId&&remote.seq>chosen.seq)chosen=remote;
                else if(remote&&remote.runId!==chosen.runId&&remote.createdAt>chosen.createdAt)chosen=remote;
            }
        }catch(_){/* local recovery remains available offline */}
        if(ticket!==generation||attempt!==choice||!own())return false;
        closePrompt(); snapshot=JSON.parse(JSON.stringify(chosen)); snapshot.writerId=writer; snapshot.seq++;
        known=Array.from(new Set(known.concat(snapshot.knownCompletions||[]))).slice(-40);
        active=true;restoring=true;blocked=false;brandNew=false;action=remoteKnown&&remoteRun!==snapshot.runId?'begin':'claim';supersedes=remoteRun;handshake=!remoteKnown;
        try { await GameRuntime.restore(snapshot); } catch (_) {
            if(ticket!==generation||attempt!==choice||!own())return false;
            GameRuntime.suspend();active=false;offer=chosen;restoreMenuContent();document.getElementById('startScreen').classList.remove('hidden');
            if(typeof showStudyNotice==='function')showStudyNotice('这次游戏的进度暂时无法恢复，可以返回主菜单再试。');menu();return false;
        } finally { restoring=false; }
        if(ticket!==generation||attempt!==choice||!own())return false;
        capture();schedule(0);menu();return true;
    }
    function finalSave() {
        if(!own()||!snapshot||!action||blocked||handshake)return;
        try {
            const state=snapshot.runId+JSON.stringify([snapshot.state,snapshot.ui,snapshot.game,snapshot.pending,snapshot.srResults]);
            if(state===finalState&&Date.now()-finalAt<500)return;
            finalState=state;finalAt=Date.now();
            const token=typeof getSessionToken==='function'?getSessionToken():null;if(!token)return;
            const body={action,runId:snapshot.runId,baseVersion:version,supersedesRunId:supersedes,
                ...(action==='complete'?{}:{snapshot})};
            // A final newer revision can overtake an in-flight older save safely.
            // This is best effort; a process kill may run no exit handler at all.
            w.fetch(API_BASE_URL+'/gameResume',{method:'POST',cache:'no-store',keepalive:true,
                headers:{'Content-Type':'application/json','X-Auth-Token':token},body:JSON.stringify(body)}).catch(()=>{});
        }catch(_){}
    }
    function observe() {
        if(observed)return;observed=true;
        const defer=()=>{if(active)Promise.resolve().then(capture);};
        ['click','keydown','input','pointerup','pointercancel'].forEach(name=>document.addEventListener(name,defer,true));
        ['spellingGame','wordRecGame','grammarGame','sentenceMatchGame'].forEach(id=>{const area=document.getElementById(id);if(area)new MutationObserver(defer).observe(area,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','disabled','hidden']});});
        setInterval(()=>{if(active&&document.visibilityState!=='hidden')capture();},5000);
        document.addEventListener('visibilitychange',()=>{capture();if(document.visibilityState==='hidden'){finalSave();flush();}});
        w.addEventListener('pagehide',()=>{capture();finalSave();flush();});w.addEventListener('online',()=>schedule(0));
    }
    async function onLogin(normal,loadOnly=false) {
        const u=user();
        if(!enabled()||!u||['teacher','BM','admin'].includes(u.role)){normal();return;}
        if(owner===u.id&&active)return;
        generation++;choice++;closePrompt();owner=u.id;active=false;handshake=false;offer=null;action=null;blocked=false;clearTimeout(timer);timer=null;
        menuContent=JSON.parse(JSON.stringify(typeof selectedClassContent!=='undefined'&&selectedClassContent||{}));
        observe();
        const ticket=generation, local=read();known=local&&local.known||[];version=local&&local.version||0;
        remember(u.gameRecoveryCompletion&&u.gameRecoveryCompletion.runId);
        (u.analytics||[]).concat(typeof analyticsQueue!=='undefined'?analyticsQueue:[])
            .filter(e=>e.type==='session'&&['gomoku','uno'].includes(e.sessionType)&&(!e.ownerId||e.ownerId===owner)).slice(-40)
            .forEach(e=>remember(e.data&&e.data.gameRunId||e.eventId));
        const eligible = (saved) => {
        const mini = saved?.ui?.mini;
        if (mini && ['spellingGame', 'wordRecGame'].includes(mini.id) &&
            hasRetiredArticleVocab([mini.tts, ...(mini.choices || []).map(choice => choice.text)], saved.content)) return null;
        return saved;
    };
        let candidate=local&&local.status==='active'&&eligible(core.validate(local.snapshot,owner));
        if(candidate&&!core.pending(candidate,u.gameRecoveryCompletion))candidate=null;
        try {
            const r=await request();
            if(ticket!==generation||!own())return;
            if(r.ok&&r.data.enabled){
                version=r.data.version||0;
                const marker=r.data.completed;remember(marker&&marker.runId);
                if(candidate&&(!core.pending(candidate,marker)||r.data.closedRunId===candidate.runId))candidate=null;
                let remote=eligible(core.validate(r.data.snapshot,owner));
                if(remote&&local&&local.status==='completed'&&!core.pending(remote,{runId:local.runId}))remote=null;
                if(remote&&(!candidate||remote.createdAt>candidate.createdAt||remote.runId===candidate.runId&&remote.seq>candidate.seq))candidate=remote;
            }
        }catch(_){/* server downtime must not prevent login or local continuation */}
        if(ticket!==generation||!own()||active)return;
        offer=candidate;observe();menu();
        if(loadOnly){normal();return;}if(offer)prompt();else normal();
    }
    function detach() {
        if(active)capture();active=false;generation++;choice++;closePrompt();clearTimeout(timer);timer=null;
        if(w.GameRuntime&&GameRuntime.isActive())GameRuntime.suspend();
        owner='';offer=null;snapshot=null;action=null;menu();
    }
    w.GameRecovery={onLogin,begin,capture,pause,complete,decorate,resume,detach,restoreMenuContent,
        runId:()=>snapshot&&snapshot.runId||null,active:()=>active,flush,enabled,showOfferOr:normal=>{if(active||document.getElementById('study-resume-dialog')||w.StudyRecovery&&StudyRecovery.active())return;if(offer)prompt();else normal();}};
})(window);
