import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT (manager) and team code on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const teamCode = localStorage.getItem('teamCode')
  if (teamCode) config.headers['x-team-code'] = teamCode

  return config
})

// 401 on admin routes → clear token, redirect to manager login
// 403 on team routes  → clear code,  redirect to team login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const path = window.location.pathname
    if (err.response?.status === 401) {
      if (path.startsWith('/admin') && path !== '/admin/login') {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin/login'
      }
    }
    if (err.response?.status === 403) {
      if (path.startsWith('/team') && path !== '/team/login') {
        localStorage.removeItem('teamCode')
        window.location.href = '/team/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
