if (location.protocol === 'file:') {
  window.addEventListener('DOMContentLoaded', () => {
    const view = location.hash.slice(1);
    if (view === 'admin' || view === 'panel') {
      for (const child of document.body.children) child.style.display = 'none';
      const frame = document.createElement('iframe');
      frame.title = 'Mi Sindicato · Pruebas locales';
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#101116';
      frame.srcdoc = window.localPanelTemplate;
      document.body.append(frame);
    } else {
      for (const image of document.querySelectorAll('img[src^="/IMG/"]')) image.src = image.getAttribute('src').slice(1);
      const note = document.createElement('p');
      note.style.cssText = 'text-align:center;color:#ffb51b;padding:12px';
      note.append('Pruebas locales · Los datos se guardan en este navegador. ');
      const admin = document.createElement('a');
      admin.textContent = 'Abrir Admin de pruebas';
      admin.href = '#admin';
      admin.style.color = '#ffb51b';
      admin.onclick = event => { event.preventDefault(); LocalDemo.navigate('/admin'); };
      note.append(admin);
      document.querySelector('main').prepend(note);
    }
  });
}
