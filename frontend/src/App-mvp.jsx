import { useState, useEffect } from 'react';
import { LayoutDashboard, BookOpen, User, LogOut, Plus, Edit, Trash2, Menu, X, Shield, GraduationCap } from 'lucide-react';
import './styles.css';

const API_BASE = '/api';

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong');
  return result;
}

function Avatar({ name, size = 'md' }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sizeClass = size === 'lg' ? 'avatar-large' : 'avatar';
  return <span className={sizeClass}>{initials}</span>;
}

function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Button({ children, onClick, variant = 'primary', className = '', ...props }) {
  return (
    <button 
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ label, type = 'text', value, onChange, placeholder, required = false }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

// Landing Page
function LandingPage({ onLogin, onRegister }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'trainee' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await onLogin(formData);
      } else {
        await onRegister(formData);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-container">
        <div className="landing-header">
          <h1>Zyngram Campus Hub</h1>
          <p>Your learning management platform</p>
        </div>
        
        <Card className="auth-card">
          <div className="auth-tabs">
            <button 
              className={`tab ${isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(true)}
            >
              Sign In
            </button>
            <button 
              className={`tab ${!isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(false)}
            >
              Register
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {!isLogin && (
              <Input
                label="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Enter your name"
                required
              />
            )}
            
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="your@email.com"
              required
            />
            
            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              placeholder={isLogin ? 'Enter password' : 'Min 6 characters'}
              required
            />

            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="form-select"
              >
                <option value="trainee">Trainee</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <Button type="submit" className="full-width">
              {isLogin ? 'Sign In' : 'Register'}
            </Button>
          </form>
        </Card>

        <div className="landing-features">
          <Card>
            <GraduationCap size={32} className="feature-icon" />
            <h3>Learn</h3>
            <p>Access courses and modules</p>
          </Card>
          <Card>
            <LayoutDashboard size={32} className="feature-icon" />
            <h3>Track Progress</h3>
            <p>Monitor your learning journey</p>
          </Card>
          <Card>
            <Shield size={32} className="feature-icon" />
            <h3>Secure</h3>
            <p>Role-based access control</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Admin Dashboard
function AdminDashboard({ user, data, onLogout, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [moduleForm, setModuleForm] = useState({ title: '', description: '', status: 'active' });

  const handleCreateModule = async () => {
    try {
      await api('/modules', {
        method: 'POST',
        body: JSON.stringify(moduleForm)
      });
      setShowModal(false);
      setModuleForm({ title: '', description: '', status: 'active' });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateModule = async (id) => {
    try {
      await api(`/modules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(moduleForm)
      });
      setShowModal(false);
      setEditingModule(null);
      setModuleForm({ title: '', description: '', status: 'active' });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteModule = async (id) => {
    if (!confirm('Are you sure you want to delete this module?')) return;
    try {
      await api(`/modules/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const openEditModal = (module) => {
    setEditingModule(module);
    setModuleForm({ title: module.title, description: module.description, status: module.status });
    setShowModal(true);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Admin Dashboard</h1>
          <p>Welcome, {user.name}</p>
        </div>
        <div className="header-right">
          <Avatar name={user.name} />
          <Button variant="secondary" onClick={onLogout}>
            <LogOut size={16} /> Sign Out
          </Button>
        </div>
      </header>

      <div className="stats-grid">
        <Card className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-number">{data.stats?.totalUsers || 0}</p>
        </Card>
        <Card className="stat-card">
          <h3>Total Modules</h3>
          <p className="stat-number">{data.stats?.totalModules || 0}</p>
        </Card>
        <Card className="stat-card">
          <h3>Active Modules</h3>
          <p className="stat-number">{data.stats?.activeModules || 0}</p>
        </Card>
      </div>

      <div className="content-section">
        <div className="section-header">
          <h2>Modules</h2>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Module
          </Button>
        </div>

        <div className="modules-grid">
          {data.modules?.map(module => (
            <Card key={module.id} className="module-card">
              <div className="module-header">
                <h3>{module.title}</h3>
                <span className={`status-badge ${module.status}`}>{module.status}</span>
              </div>
              <p>{module.description || 'No description'}</p>
              <div className="module-actions">
                <Button variant="secondary" size="sm" onClick={() => openEditModal(module)}>
                  <Edit size={14} />
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDeleteModule(module.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <Card className="modal">
            <div className="modal-header">
              <h2>{editingModule ? 'Edit Module' : 'Create Module'}</h2>
              <Button variant="secondary" onClick={() => { setShowModal(false); setEditingModule(null); setModuleForm({ title: '', description: '', status: 'active' }); }}>
                <X size={16} />
              </Button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); editingModule ? handleUpdateModule(editingModule.id) : handleCreateModule(); }}>
              <Input
                label="Title"
                value={moduleForm.title}
                onChange={(e) => setModuleForm({...moduleForm, title: e.target.value})}
                placeholder="Module title"
                required
              />
              <TextArea
                label="Description"
                value={moduleForm.description}
                onChange={(e) => setModuleForm({...moduleForm, description: e.target.value})}
                placeholder="Module description"
              />
              <div className="form-group">
                <label>Status</label>
                <select
                  value={moduleForm.status}
                  onChange={(e) => setModuleForm({...moduleForm, status: e.target.value})}
                  className="form-select"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <Button type="submit" className="full-width">
                {editingModule ? 'Update' : 'Create'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// Trainee Dashboard
function TraineeDashboard({ user, data, onLogout, onRefresh }) {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    bio: data.profile?.bio || '',
    skills: data.profile?.skills || '',
    goals: data.profile?.goals || ''
  });

  const handleSaveProfile = async () => {
    try {
      await api('/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm)
      });
      setShowProfileModal(false);
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Trainee Dashboard</h1>
          <p>Welcome, {user.name}</p>
        </div>
        <div className="header-right">
          <Button variant="secondary" onClick={() => setShowProfileModal(true)}>
            <User size={16} /> Profile
          </Button>
          <Avatar name={user.name} />
          <Button variant="secondary" onClick={onLogout}>
            <LogOut size={16} /> Sign Out
          </Button>
        </div>
      </header>

      <div className="content-section">
        <div className="section-header">
          <h2>Available Modules</h2>
        </div>

        <div className="modules-grid">
          {data.modules?.filter(m => m.status === 'active').map(module => (
            <Card key={module.id} className="module-card">
              <div className="module-header">
                <h3>{module.title}</h3>
                <span className="status-badge active">Active</span>
              </div>
              <p>{module.description || 'No description'}</p>
              <Button variant="primary" className="full-width">
                <BookOpen size={16} /> Start Learning
              </Button>
            </Card>
          ))}
        </div>

        {data.modules?.filter(m => m.status === 'active').length === 0 && (
          <Card className="empty-state">
            <BookOpen size={48} />
            <h3>No modules available</h3>
            <p>Check back later for new learning content.</p>
          </Card>
        )}
      </div>

      {showProfileModal && (
        <div className="modal-overlay">
          <Card className="modal">
            <div className="modal-header">
              <h2>Your Profile</h2>
              <Button variant="secondary" onClick={() => setShowProfileModal(false)}>
                <X size={16} />
              </Button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}>
              <TextArea
                label="Bio"
                value={profileForm.bio}
                onChange={(e) => setProfileForm({...profileForm, bio: e.target.value})}
                placeholder="Tell us about yourself"
                rows={4}
              />
              <TextArea
                label="Skills"
                value={profileForm.skills}
                onChange={(e) => setProfileForm({...profileForm, skills: e.target.value})}
                placeholder="Your skills (comma separated)"
                rows={2}
              />
              <TextArea
                label="Learning Goals"
                value={profileForm.goals}
                onChange={(e) => setProfileForm({...profileForm, goals: e.target.value})}
                placeholder="What do you want to achieve?"
                rows={2}
              />
              <Button type="submit" className="full-width">
                Save Profile
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// Main App
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await api('/auth/session');
      if (response.user) {
        setUser(response.user);
        await fetchData(response.user);
      }
    } catch (err) {
      // No session
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (currentUser) => {
    try {
      const dashboard = await api('/dashboard');
      setData(dashboard);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  const handleLogin = async (formData) => {
    const response = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    setUser(response.user);
    await fetchData(response.user);
  };

  const handleRegister = async (formData) => {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    // Auto-login after registration
    await handleLogin(formData);
  };

  const handleLogout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setData(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <LandingPage onLogin={handleLogin} onRegister={handleRegister} />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard user={user} data={data} onLogout={handleLogout} onRefresh={() => fetchData(user)} />;
  }

  return <TraineeDashboard user={user} data={data} onLogout={handleLogout} onRefresh={() => fetchData(user)} />;
}
