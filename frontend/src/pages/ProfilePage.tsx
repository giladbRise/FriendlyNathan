import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import Navigation from '../components/Navigation';

const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);

  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
    if (profileError) setProfileError('');
    if (profileSuccess) setProfileSuccess('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    if (passwordError) setPasswordError('');
    if (passwordSuccess) setPasswordSuccess('');
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    // Validation
    if (!profileData.firstName || !profileData.lastName) {
      setProfileError('Please fill in both first and last name');
      return;
    }

    setIsProfileSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        'http://localhost:3000/api/auth/profile',
        {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setProfileSuccess('Profile updated successfully!');
      updateUser(response.data.user);
    } catch (error: any) {
      setProfileError(
        error.response?.data?.error ||
        error.response?.data?.details?.[0]?.message ||
        'Failed to update profile'
      );
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordError('Please fill in all fields');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    if (!/[A-Z]/.test(passwordData.newPassword)) {
      setPasswordError('New password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(passwordData.newPassword)) {
      setPasswordError('New password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(passwordData.newPassword)) {
      setPasswordError('New password must contain at least one number');
      return;
    }

    setIsPasswordSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        'http://localhost:3000/api/auth/change-password',
        {
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPasswordSuccess('Password changed successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      setPasswordError(
        error.response?.data?.error ||
        error.response?.data?.details?.[0]?.message ||
        'Failed to change password'
      );
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-4">Profile Information</h2>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {profileError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-md">
                {profileSuccess}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-muted-foreground cursor-not-allowed"
              />
              <p className="mt-1 text-sm text-muted-foreground">Email cannot be changed</p>
            </div>

            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-muted-foreground mb-1">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={profileData.firstName}
                onChange={handleProfileChange}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isProfileSubmitting}
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-muted-foreground mb-1">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={profileData.lastName}
                onChange={handleProfileChange}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isProfileSubmitting}
              />
            </div>

            <div>
              <span className="text-sm font-medium text-muted-foreground">Role:</span>
              <p className="text-foreground capitalize mt-1">{user?.role}</p>
            </div>

            <button
              type="submit"
              disabled={isProfileSubmitting}
              className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProfileSubmitting ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-2xl font-bold text-foreground mb-4">Change Password</h2>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-md">
                {passwordSuccess}
              </div>
            )}

            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-muted-foreground mb-1">
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                value={passwordData.currentPassword}
                onChange={handlePasswordChange}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isPasswordSubmitting}
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-muted-foreground mb-1">
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                value={passwordData.newPassword}
                onChange={handlePasswordChange}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isPasswordSubmitting}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Min 8 chars, must include uppercase, lowercase, and number
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-muted-foreground mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={passwordData.confirmPassword}
                onChange={handlePasswordChange}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isPasswordSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isPasswordSubmitting}
              className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPasswordSubmitting ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
