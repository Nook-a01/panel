// Corre sólo en la página de instalación del panel. No lee nada: deja una
// marca con la versión para que la página sepa que la extensión está puesta
// y, si llegaste por el enlace, te mande directo a Instagram con el panel.
document.documentElement.setAttribute("data-panel-instalado", "1.4.3");
document.dispatchEvent(new CustomEvent("panel-instagram-listo", { detail: { version: "1.4.3" } }));
