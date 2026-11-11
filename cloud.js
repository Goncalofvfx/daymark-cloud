/* Daymark Cloud: optional Firebase Auth + Firestore collaboration.
   Configure firebase-config.js, enable Authentication and publish firestore.rules.
   The standalone/local edition works without any Firebase credentials. */
const cfg = window.DAYMARK_FIREBASE_CONFIG;
const gate = document.getElementById('cloudGate');
const content = document.getElementById('cloudGateContent');
const card = document.getElementById('cloudUserCard');
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const randomId = () => crypto.randomUUID().replaceAll('-', '');
const safeName = user => (user.displayName || user.email?.split('@')[0] || 'Member').slice(0, 40);

if (cfg?.apiKey && cfg?.projectId && cfg?.appId) {
  const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
  try {
    const [firebaseApp, firebaseAuth, firebaseDB] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const {initializeApp} = firebaseApp;
    const {getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
      signInWithPopup, GoogleAuthProvider, signOut, updateProfile, sendPasswordResetEmail,
      sendEmailVerification} = firebaseAuth;
    const {getFirestore, doc, collection, getDoc, setDoc, onSnapshot, writeBatch} = firebaseDB;
    const app = initializeApp(cfg);
    const auth = getAuth(app), db = getFirestore(app);

    let account = null, teamId = null, teamMeta = null;
    let teamChoices = [], unsubTeams = null, unsubData = [];
    let snapshots = {members:null,tasks:null,events:null};
    let baseline = {users:[],tasks:[],events:[]};
    let pendingJoin = new URLSearchParams(location.search).get('join') || '';
    let opening = false;
    const documentId = (table, id) => doc(db, 'teams', teamId, table, id);
    const setMessage = (message, kind='cloud-alert') => {
      let el = content.querySelector('#cloudMessage');
      if (!el) { el = document.createElement('p'); el.id = 'cloudMessage'; content.prepend(el); }
      el.className = kind; el.textContent = message;
    };
    const errorText = error => {
      let code = error?.code || '';
      let messages = {
        'auth/email-already-in-use':'That email already has an account. Please sign in.',
        'auth/weak-password':'Use a stronger password (at least six characters).',
        'auth/invalid-credential':'Email or password not recognised.',
        'auth/invalid-email':'Please enter a valid email address.',
        'auth/popup-closed-by-user':'Google sign-in was cancelled.',
        'auth/unauthorized-domain':'Add this site to Authentication → Settings → Authorized domains in Firebase.',
        'permission-denied':'Firebase denied access. Check the Firestore rules, membership and verified email.',
        'unavailable':'The cloud database is temporarily unavailable. Check your connection.'
      };
      return messages[code] || error?.message || 'Something went wrong. Please try again.';
    };
    const fail = error => { console.error('Daymark Cloud:', error); setMessage(errorText(error)); };
    const renderGate = html => { gate.classList.remove('hidden'); content.innerHTML = html; };
    const hideGate = () => gate.classList.add('hidden');
    const authButtons = () => `<div class="cloud-actions-row"><button id="cloudGoogle" class="btn cloud-wide" type="button">Continue with Google</button></div>`;

    function showSignIn(mode='login') {
      let signup = mode==='signup';
      renderGate(`<h2>${signup?'Create your Daymark account':'Your calendar, anywhere'}</h2>
      <p>${signup?'Start with an individual account, then create or join a team.':'Sign in on any computer or phone to see your shared Daymark workspace.'}</p>
      <form id="cloudAuthForm">
       ${signup?'<div class="cloud-field"><label>Your name</label><input name="displayName" maxlength="40" required autocomplete="name" placeholder="e.g. Alex"></div>':''}
       <div class="cloud-field"><label>Email address</label><input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
       <div class="cloud-field"><label>Password</label><input name="password" type="password" minlength="6" required autocomplete="${signup?'new-password':'current-password'}" placeholder="Minimum 6 characters"></div>
       <button type="submit" class="btn primary cloud-wide">${signup?'Create account':'Sign in'}</button>
      </form>${authButtons()}
      <div class="cloud-actions-row"><button class="cloud-link" id="cloudSwap">${signup?'Already registered? Sign in':'New here? Create an account'}</button>
      ${signup?'':'<button class="cloud-link" id="cloudForgot">Forgot password?</button>'}</div>
      <p class="cloud-muted">Your calendar data belongs to your team. Only invited accounts can join existing teams.</p>`);
      $('cloudSwap').onclick = () => showSignIn(signup?'login':'signup');
      $('cloudAuthForm').onsubmit = async ev => {
        ev.preventDefault(); const form = new FormData(ev.currentTarget), email = String(form.get('email')).trim(), password=String(form.get('password'));
        const btn=ev.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
        try {
          if(signup) {
            const result = await createUserWithEmailAndPassword(auth,email,password);
            await updateProfile(result.user,{displayName:String(form.get('displayName')).trim()});
            await sendEmailVerification(result.user);
            showVerify();
          } else await signInWithEmailAndPassword(auth,email,password);
        } catch(error) { fail(error); btn.disabled=false; }
      };
      $('cloudGoogle').onclick = async () => {
        $('cloudGoogle').disabled=true;
        try { await signInWithPopup(auth, new GoogleAuthProvider()); }
        catch(error) { fail(error); $('cloudGoogle').disabled=false; }
      };
      if(!signup) $('cloudForgot').onclick = async () => {
        const email=prompt('Enter the email address for the password reset link:');
        if(!email) return;
        try {await sendPasswordResetEmail(auth,email.trim());setMessage('If the email is registered, a reset link is on its way.','cloud-good');}
        catch(error){fail(error)}
      };
    }

    function showVerify() {
      if (!account) return showSignIn();
      renderGate(`<h2>Verify your email</h2><p>For team invitations, we need to verify that you own <strong>${escapeHTML(account.email)}</strong>.</p>
       <p>Open the verification email from Firebase, click its link, then come back here.</p>
       <button type="button" id="cloudVerified" class="btn primary cloud-wide">I've verified my email</button>
       <div class="cloud-actions-row"><button id="cloudResend" class="btn">Resend email</button><button id="cloudSignOut" class="btn">Use another account</button></div>`);
      $('cloudVerified').onclick = async () => {
        try {await account.reload();await account.getIdToken(true);
          if(account.emailVerified) { await loadTeamChoices(); }
          else setMessage('This email is not verified yet. Open the link and try again.');
        } catch(error) { fail(error); }
      };
      $('cloudResend').onclick = async () => {try{await sendEmailVerification(account);setMessage('Verification email sent.','cloud-good')}catch(error){fail(error)}};
      $('cloudSignOut').onclick = () => signOut(auth);
    }

    function showWorkspaceChoice() {
      renderGate(`<h2>Choose your workspace</h2><p>Welcome, ${escapeHTML(safeName(account))}. Select a team or create your own.</p>
        <div class="cloud-team-list" id="cloudTeamsList">${teamChoices.length?teamChoices.map(t=>`<button class="cloud-team-choice" data-team-id="${escapeHTML(t.id)}">${escapeHTML(t.name||'Daymark team')} <span>›</span></button>`).join(''):'<p class="cloud-muted">No workspaces yet. Create one or join an invitation.</p>'}</div>
        <div class="cloud-actions-row"><button type="button" id="cloudCreate" class="btn primary">+ Create team</button><button type="button" id="cloudJoin" class="btn">Join invited team</button></div>
        <button type="button" id="cloudSignOut" class="cloud-link">Sign out</button>`);
      content.querySelectorAll('[data-team-id]').forEach(btn=>btn.onclick=()=>openTeam(btn.dataset.teamId));
      $('cloudCreate').onclick=showTeamCreate;
      $('cloudJoin').onclick=()=>showTeamJoin();
      $('cloudSignOut').onclick=()=>signOut(auth);
    }

    function showTeamCreate() {
      renderGate(`<h2>Create a team</h2><p>Every member will have their own calendar and appear in the comparison dashboard.</p>
       <form id="cloudTeamForm"><div class="cloud-field"><label>Team name</label><input name="teamName" required maxlength="65" placeholder="e.g. VFX team"></div>
       <button type="submit" class="btn primary cloud-wide">Create team</button></form>
       <button class="cloud-link" id="cloudBack">Back to workspaces</button>`);
      $('cloudBack').onclick=showWorkspaceChoice;
      $('cloudTeamForm').onsubmit=async ev=>{
        ev.preventDefault();let btn=ev.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
        const name=String(new FormData(ev.currentTarget).get('teamName')).trim(); if(!name)return;
        const id=randomId(), now=Date.now(), batch=writeBatch(db);
        const me=account.uid;
        batch.set(doc(db,'teams',id),{name,createdBy:me,createdAt:now});
        batch.set(doc(db,'teams',id,'members',me),{uid:me,email:(account.email||'').toLowerCase(),name:safeName(account),calendarName:'My calendar',color:'#605ee9',role:'owner',joinedAt:now});
        batch.set(doc(db,'users',me,'teams',id),{name,joinedAt:now});
        try {await batch.commit();await openTeam(id)}catch(error){fail(error);btn.disabled=false}
      };
    }

    function showTeamJoin(prefill=pendingJoin) {
      renderGate(`<h2>Join a team</h2><p>You need an invitation sent to your verified email address. Paste the workspace ID from the invitation link.</p>
       <form id="cloudJoinForm"><div class="cloud-field"><label>Workspace ID</label><input name="teamId" required value="${escapeHTML(prefill)}" placeholder="Paste the code in your invitation"></div>
       <button type="submit" class="btn primary cloud-wide">Join team</button></form>
       <button id="cloudBack" type="button" class="cloud-link">Back to workspaces</button>`);
      $('cloudBack').onclick=showWorkspaceChoice;
      $('cloudJoinForm').onsubmit=async ev=>{ev.preventDefault(); const id=String(new FormData(ev.currentTarget).get('teamId')).trim(); await acceptInvite(id)};
    }

    async function acceptInvite(id) {
      if(!account?.emailVerified){showVerify();return}
      if(!/^[A-Za-z0-9_-]{12,120}$/.test(id)){setMessage('Enter a valid workspace ID from your invitation.');return}
      try {
        const myIndex=doc(db,'users',account.uid,'teams',id);
        const existsIndex=await getDoc(myIndex);
        if(existsIndex.exists()){pendingJoin=''; await openTeam(id);return}
        const invitedEmail=(account.email||'').trim().toLowerCase();
        const invitation=await getDoc(doc(db,'teams',id,'invites',invitedEmail));
        if(!invitation.exists())throw new Error('No invitation for this email address. Ask the team owner to invite '+invitedEmail+'.');
        const now=Date.now(), batch=writeBatch(db);
        batch.set(doc(db,'teams',id,'members',account.uid),{uid:account.uid,email:invitedEmail,name:safeName(account),calendarName:safeName(account)+'’s calendar',color:'#21a891',role:'member',joinedAt:now});
        // The workspace title is read only after membership has been granted.
        batch.set(myIndex,{name:'Shared team',joinedAt:now});
        await batch.commit();pendingJoin='';
        history.replaceState(null,'',location.pathname + location.hash);
        await openTeam(id);
      }catch(error){fail(error)}
    }

    const unsubscribe = () => {unsubData.forEach(fn=>fn());unsubData=[];};
    async function loadTeamChoices() {
      if(!account)return;
      unsubTeams?.();
      unsubTeams=onSnapshot(collection(db,'users',account.uid,'teams'), async snap=>{
        teamChoices=snap.docs.map(d=>({id:d.id,...d.data()}));
        if(opening||teamId)return;
        if(pendingJoin){const code=pendingJoin;pendingJoin=''; await acceptInvite(code);return}
        const preferred=localStorage.getItem('daymark-cloud-workspace-'+account.uid);
        if(preferred&&teamChoices.some(t=>t.id===preferred))await openTeam(preferred);
        else if(teamChoices.length===1)await openTeam(teamChoices[0].id);
        else showWorkspaceChoice();
      },err=>fail(err));
    }
    function currentState() {return window.DaymarkUI.getState()}
    function clone(data) {return JSON.parse(JSON.stringify(data))}
    function useSnapshots() {
      if(Object.values(snapshots).some(v=>v===null))return;
      const users=snapshots.members.docs.map(d=>({id:d.id,...d.data()}));
      const tasks=snapshots.tasks.docs.map(d=>({id:d.id,...d.data(),userId:d.data().ownerUid}));
      const events=snapshots.events.docs.map(d=>({id:d.id,...d.data(),userId:d.data().ownerUid}));
      const data={users,tasks,events};baseline=clone(data);
      window.DaymarkUI.receive(data);
      $('cloudTeamName').textContent=teamMeta?.name||'Shared workspace';
      $('cloudAccountName').textContent=safeName(account)+' · Online';
    }
    async function openTeam(id) {
      if(!account||opening)return;
      opening=true;
      try {
        const meta=await getDoc(doc(db,'teams',id));
        if(!meta.exists())throw new Error('Workspace not found.');
        unsubscribe();
        teamId=id;teamMeta=meta.data();
        localStorage.setItem('daymark-cloud-workspace-'+account.uid,id);
        window.DaymarkUI.setIdentity(account.uid);
        snapshots={members:null,tasks:null,events:null};baseline={users:[],tasks:[],events:[]};
        card.classList.remove('hidden');
        $('cloudInviteBtn').hidden=teamMeta.createdBy!==account.uid;
        const subscriptions=[['members','members'],['tasks','tasks'],['events','events']];
        for(const [type,table] of subscriptions){
          unsubData.push(onSnapshot(collection(db,'teams',teamId,table),snap=>{snapshots[type]=snap;useSnapshots();},err=>{console.error(err);setMessage(errorText(err));gate.classList.remove('hidden')}));
        }
        hideGate();
      } catch(error){fail(error);if(!teamId)showWorkspaceChoice();}
      finally{opening=false}
    }

    // Diff documents, not a single shared JSON blob, so two people can edit distinct
    // calendar blocks at the same time without replacing the other's changes.
    let writeQueue=Promise.resolve();
    const comparable = item => JSON.stringify(item);
    function sanitizedTask(t) {return {ownerUid:t.userId,title:String(t.title||'').slice(0,80),category:String(t.category||'Other'),duration:Number(t.duration)||60,color:typeof t.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(t.color)?t.color.toLowerCase():null}}
    function sanitizedEvent(e) {return {ownerUid:e.userId,taskId:e.taskId,start:Number(e.start),duration:Number(e.duration),tracked:Number(e.tracked)||0,timerStart:e.timerStart||null,notes:String(e.notes||'').slice(0,2000)}}
    function changeSet(state) {
      const operations=[];
      const compareList=(table,oldList,newList,normalize)=>{
        const oldMap=new Map(oldList.map(x=>[x.id,x]));const newMap=new Map(newList.map(x=>[x.id,x]));
        for(const [id,obj] of newMap) {
          const existing=oldMap.get(id);
          if((!existing||comparable(normalize(obj))!==comparable(normalize(existing)))&&obj.userId===account.uid){
            operations.push({action:'set',ref:documentId(table,id),data:normalize(obj)});
          }
        }
        for(const [id,obj] of oldMap)if(!newMap.has(id)&&obj.userId===account.uid)operations.push({action:'delete',ref:documentId(table,id)});
      };
      compareList('tasks',baseline.tasks,state.tasks,sanitizedTask);
      compareList('events',baseline.events,state.events,sanitizedEvent);
      const prevUser=baseline.users.find(u=>u.id===account.uid);
      const nowUser=state.users.find(u=>u.id===account.uid);
      if(prevUser&&nowUser){
        const fields=['name','calendarName','color'];
        const patch=Object.fromEntries(fields.filter(k=>String(prevUser[k]||'')!==String(nowUser[k]||'')).map(k=>[k,String(nowUser[k]||'')]));
        if(Object.keys(patch).length)operations.push({action:'update',ref:documentId('members',account.uid),data:patch});
      }
      return operations;
    }
    function saveState(state) {
      if(!teamId||!account)return;
      const ops=changeSet(state);
      if(!ops.length)return;
      baseline=clone(state);
      // Keep batches below Firestore's maximum write count; queue them in order.
      for(let i=0;i<ops.length;i+=200){const chunk=ops.slice(i,i+200);
        writeQueue=writeQueue.then(async()=>{
          const batch=writeBatch(db);
          for(const op of chunk) {
            if(op.action==='delete')batch.delete(op.ref);
            else if(op.action==='update')batch.update(op.ref,op.data);
            else batch.set(op.ref,op.data);
          }
          await batch.commit();
        }).catch(err=>{console.error('Sync failure:',err);window.DaymarkUI.toast(errorText(err));});
      }
    }
    function showInvite() {
      if(!account||!teamId)return;
      if(teamMeta.createdBy!==account.uid) {window.DaymarkUI.toast('Only the team owner can invite members.');return}
      renderGate(`<h2>Invite a team member</h2><p>Add the email they will use to sign in. Then send them the workspace link.</p>
      <form id="cloudInviteForm"><div class="cloud-field"><label>Member email</label><input name="inviteEmail" required type="email" placeholder="colleague@example.com"></div>
      <button type="submit" class="btn primary cloud-wide">Create invitation</button></form>
      <button id="cloudClose" class="cloud-link">Back to calendar</button>`);
      $('cloudClose').onclick=hideGate;
      $('cloudInviteForm').onsubmit=async e=>{
        e.preventDefault();const email=String(new FormData(e.currentTarget).get('inviteEmail')).trim().toLowerCase();
        if(!email.includes('@'))return;
        try {
          await setDoc(doc(db,'teams',teamId,'invites',email),{email,createdBy:account.uid,createdAt:Date.now()});
          const url=location.origin+location.pathname+'?join='+encodeURIComponent(teamId);
          renderGate(`<h2>Invitation ready ✉</h2><p>Send this link to <strong>${escapeHTML(email)}</strong>. Only that verified email can join.</p>
           <div class="cloud-field"><label>Invite link</label><input readonly id="cloudInviteLink" value="${escapeHTML(url)}"></div>
           <button id="cloudCopyInvite" type="button" class="btn primary cloud-wide">Copy invite link</button>
           <button id="cloudDone" type="button" class="cloud-link">Done</button>`);
          $('cloudCopyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(url);setMessage('Link copied.','cloud-good')}
             catch{ $('cloudInviteLink').select();setMessage('Select and copy the link above.','cloud-good')} };
          $('cloudDone').onclick=hideGate;
        } catch(error){fail(error)}
      };
    }
    window.DaymarkCloud={save:saveState,showInvite,showTeams:()=>{unsubscribe();teamId=null;teamMeta=null;card.classList.add('hidden');window.DaymarkUI.stop();showWorkspaceChoice()},signOut:()=>signOut(auth)};
    $('cloudInviteBtn').onclick=()=>showInvite();
    $('cloudSwitchBtn').onclick=()=>window.DaymarkCloud.showTeams();
    $('cloudLogoutBtn').onclick=()=>signOut(auth);
    onAuthStateChanged(auth, async user=>{
      unsubscribe();unsubTeams?.();unsubTeams=null;teamId=null;teamMeta=null;teamChoices=[];
      account=user;
      card.classList.add('hidden');window.DaymarkUI.stop();
      if(!user) {showSignIn();return}
      if(!user.emailVerified && pendingJoin) {showVerify();return}
      try{await loadTeamChoices()}catch(error){fail(error)}
    });
  }catch(error){
    console.error('Firebase startup failed:',error);
    gate.classList.remove('hidden');
    content.innerHTML=`<h2>Cloud connection error</h2><p class="cloud-alert">${escapeHTML(error.message||'Unable to load Firebase.')}</p><p>Please check your internet connection and Firebase setup.</p>`;
  }
}
