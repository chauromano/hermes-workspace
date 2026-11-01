import { describe, it, expect, vi } from 'vitest'
import { toast } from '../toast'

describe('toast notification utility', () => {
  it('supports direct function calls', () => {
    expect(typeof toast).toBe('function')
    expect(() => toast('Test direct')).not.toThrow()
  })

  it('supports toast.info, toast.success, toast.warning, toast.error helper methods', () => {
    expect(typeof toast.info).toBe('function')
    expect(typeof toast.success).toBe('function')
    expect(typeof toast.warning).toBe('function')
    expect(typeof toast.error).toBe('function')
    expect(typeof toast.dismiss).toBe('function')

    expect(() => toast.info('Info message')).not.toThrow()
    expect(() => toast.success('Project created successfully')).not.toThrow()
    expect(() => toast.warning('Warning message')).not.toThrow()
    expect(() => toast.error('Error message')).not.toThrow()
    expect(() => toast.dismiss()).not.toThrow()
  })
})
