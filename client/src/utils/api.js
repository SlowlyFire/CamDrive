import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT to every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 from admin routes, clear token and redirect to login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname
      if (path.startsWith('/admin') && path !== '/admin/login') {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
