const App = {
  currentPage: null,
  init() {
    if (!API.token) { this.navigate('login'); return; }
    this.navigate('projects');
  },
  navigate(page, params) {
    this.currentPage = page;
    const app = document.getElementById('app');
    switch (page) {
      case 'login': LoginPage.render(app); break;
      case 'projects': ProjectsPage.render(app); break;
      case 'workspace': WorkspacePage.render(app, params); break;
      case 'settings': SettingsPage.render(app); break;
      case 'admin': AdminPage.render(app); break;
      default: ProjectsPage.render(app);
    }
  },
  showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
