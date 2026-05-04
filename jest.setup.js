// Jest setup file for ESM support
// This file makes jest globals available in ESM modules
import jestFn from 'jest-mock-function-compat';

global.jest = {
  fn: (...args) => {
    const mockFn = function() {};
    mockFn.mockImplementation = () => mockFn;
    mockFn.mockReturnValue = () => mockFn;
    mockFn.mockReturnValueOnce = () => mockFn;
    mockFn.mockResolvedValue = () => mockFn;
    mockFn.mockResolvedValueOnce = () => mockFn;
    mockFn.mockRejectedValue = () => mockFn;
    mockFn.mockRejectedValueOnce = () => mockFn;
    mockFn.mockClear = () => mockFn;
    mockFn.mockReset = () => mockFn;
    mockFn.mockRestore = () => mockFn;
    mockFn.mock = { calls: [], results: [], instances: [] };
    mockFn.toHaveBeenCalled = false;
    mockFn.toHaveBeenCalledWith = () => true;
    
    // Implement jest.fn() properly
    const actual = jestFn(...args);
    return actual;
  }
};
