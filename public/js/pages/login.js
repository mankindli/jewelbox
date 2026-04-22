const LoginPage = {
  render(container) {
    container.innerHTML = `
      <div class="login-page">
        <article class="login-box">
          <header class="login-header">
            <div class="login-logo">&#x1F48E;</div>
            <h1>JewelBox</h1>
            <p class="subtitle">AI珠宝设计平台</p>
          </header>
          <form id="loginForm">
            <label>用户名
              <input type="text" id="username" placeholder="请输入用户名" required>
            </label>
            <label>密码
              <input type="password" id="password" placeholder="请输入密码" required>
            </label>
            <button type="submit">登录</button>
          </form>
          <p id="loginError" class="error-text"></p>
        </article>
      </div>`;
    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const data = await API.post('/api/auth/login', {
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        });
        if (data) { API.setAuth(data.token, data.user); App.navigate('projects'); }
      } catch (err) {
        document.getElementById('loginError').textContent = err.message;
      }
    };
  }
};
