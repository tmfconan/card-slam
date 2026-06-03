import { useState, useEffect, useCallback } from "react";
import api from "../api/client";

interface User {
  username: string;
  role: "admin" | "user";
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    const { data } = await api.get("/admin/users/");
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    setCreating(true);
    setError("");
    try {
      await api.post("/admin/users/", {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await fetchUsers();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 409 ? "Username already exists." : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (username: string, role: "admin" | "user") => {
    await api.put(`/admin/users/${username}/role`, { role });
    await fetchUsers();
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}" and all their data?`)) return;
    await api.delete(`/admin/users/${username}`);
    await fetchUsers();
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">User Accounts</h2>

      {/* Create form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Create Account</h3>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="off"
            className="flex-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="flex-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            aria-label="Role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
            className="border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={!newUsername.trim() || !newPassword || creating}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </form>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      {/* User list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-400 text-center py-10">Loading…</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                  Username
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                  Role
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                  Created
                </th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.username} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="py-3 px-4 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {user.username}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    {user.username !== "admin" && (
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() =>
                            handleRoleChange(
                              user.username,
                              user.role === "admin" ? "user" : "admin"
                            )
                          }
                          className="text-xs text-gray-400 dark:text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          {user.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                        <button
                          onClick={() => handleDelete(user.username)}
                          className="text-xs text-gray-400 dark:text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
