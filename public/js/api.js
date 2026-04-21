const API = {
  token: localStorage.getItem('jb_token'),
  user: JSON.parse(localStorage.getItem('jb_user') || 'null'),

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('jb_token', token);
    localStorage.setItem('jb_user', JSON.stringify(user));
  },

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('jb_token');
    localStorage.removeItem('jb_user');
  },

  async request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const resp = await fetch(url, { ...options, headers });
    if (resp.status === 401) { this.clearAuth(); App.navigate('login'); return null; }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: '请求失败' }));
      throw new Error(err.error || '请求失败');
    }
    if (resp.headers.get('content-type')?.includes('application/json')) return resp.json();
    return resp;
  },

  get(url) { return this.request(url); },
  post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); },
  put(url, body) { return this.request(url, { method: 'PUT', body: JSON.stringify(body) }); },
  del(url) { return this.request(url, { method: 'DELETE' }); }
};
