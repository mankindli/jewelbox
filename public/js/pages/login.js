const LoginPage = {
  render(container) {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-box">
          <h1>JewelBox</h1>
          <p class="subtitle">AI珠宝设计平台</p>
          <form id="loginForm">
            <input type="text" id="username" placeholder="用户名" required>
            <input type="password" id="password" placeholder="密码" required>
            <button type="submit" class="btn btn-primary btn-block">登录</button>
          </form>
          <p id="loginError" class="error-text"></p>
        </div>
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
