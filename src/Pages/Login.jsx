import React, { useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "../firebase/firebase"

const Login = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const onSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(err.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#e3e3e3] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#131314] border border-[#333537] rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-1">Login</h1>
        <p className="text-sm text-[#9aa0a6] mb-6">Sign in to continue</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-2 text-[#c7c7c7]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#1e1f20] border border-[#333537] rounded-xl px-4 py-3 text-sm placeholder-[#8e918f] outline-none focus:border-[#1f3a68]"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-[#c7c7c7]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#1e1f20] border border-[#333537] rounded-xl px-4 py-3 text-sm placeholder-[#8e918f] outline-none focus:border-[#1f3a68]"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1f3a68] hover:bg-[#284b85] text-white rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            type="button"
            onClick={onSwitchToRegister}
            className="w-full text-sm text-[#9aa0a6] hover:text-[#e3e3e3]"
          >
            Need an account? Register
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
