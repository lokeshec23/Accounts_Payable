import api from './api';

export const authService = {
  async register(userData) {
    try {
      const response = await api.post('/auth/register', userData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async checkEmail(email) {
    try {
      const response = await api.post('/auth/check-email', { email });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async resetPassword(email, newPassword) {
    try {
      const response = await api.post('/auth/reset-password', {
        email,
        new_password: newPassword
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async sendOtp(email, purpose) {
    try {
      const response = await api.post('/auth/send-otp', { email, purpose });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async verifyOtp(email, otpCode, purpose) {
    try {
      const response = await api.post('/auth/verify-otp', {
        email,
        otp_code: otpCode,
        purpose
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async login(credentials) {
    try {
      const response = await api.post('/auth/login', credentials);
      if (response.data.access_token) {
        sessionStorage.setItem('token', response.data.access_token);
        // Store user info for display purposes
        sessionStorage.setItem('user', JSON.stringify({
          email: credentials.email,
          username: response.data.username || credentials.email.split('@')[0],
          role: response.data.role,
          ispasswordchange: response.data.ispasswordchange
        }));
      }
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async changePasswordFirstTime(email, newPassword) {
    try {
      const response = await api.post('/auth/change-password-first-time', {
        email,
        new_password: newPassword
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  },

  getToken() {
    return sessionStorage.getItem('token');
  },

  isAuthenticated() {
    return !!sessionStorage.getItem('token');
  },

  getCurrentUser() {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }
};