import React, { useState } from "react"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "../firebase/firebase"

const Register = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const onSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(err.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#e3e3e3] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#131314] border border-[#333537] rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-1">Register</h1>
        <p className="text-sm text-[#9aa0a6] mb-6">Create your account</p>

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
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#1e1f20] border border-[#333537] rounded-xl px-4 py-3 text-sm placeholder-[#8e918f] outline-none focus:border-[#1f3a68]"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-[#c7c7c7]" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? "Creating account..." : "Register"}
          </button>

          <button
            type="button"
            onClick={onSwitchToLogin}
            className="w-full text-sm text-[#9aa0a6] hover:text-[#e3e3e3]"
          >
            Already have an account? Login
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register
