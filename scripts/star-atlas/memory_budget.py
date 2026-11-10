"""Shared process-family memory admission for explicit atlas commands."""
import os
import ctypes
RAM_LIMIT = 512 * 1024**2
_memory_job = None

def limit_memory():
    """Enforce the preparation process's private commit limit, including native codec buffers."""
    global _memory_job
    if os.name != "nt":
        import resource
        resource.setrlimit(resource.RLIMIT_DATA, (RAM_LIMIT, RAM_LIMIT))
        return
    from ctypes import wintypes as w
    class Basic(ctypes.Structure):
        _fields_ = [("processTime",ctypes.c_int64),("jobTime",ctypes.c_int64),("flags",w.DWORD),
                    ("minWorkingSet",ctypes.c_size_t),("maxWorkingSet",ctypes.c_size_t),("active",w.DWORD),
                    ("affinity",ctypes.c_size_t),("priority",w.DWORD),("scheduling",w.DWORD)]
    class Extended(ctypes.Structure):
        _fields_ = [("basic",Basic),("io",ctypes.c_uint64*6),("processMemory",ctypes.c_size_t),
                    ("jobMemory",ctypes.c_size_t),("peakProcess",ctypes.c_size_t),("peakJob",ctypes.c_size_t)]
    kernel = ctypes.WinDLL("kernel32",use_last_error=True)
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p,w.LPCWSTR]
    kernel.GetCurrentProcess.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE,w.HANDLE]
    _memory_job = kernel.CreateJobObjectW(None,None)
    limits = Extended(); limits.basic.flags = 0x300; limits.processMemory = RAM_LIMIT; limits.jobMemory = RAM_LIMIT
    if not _memory_job or not kernel.SetInformationJobObject(_memory_job,9,ctypes.byref(limits),ctypes.sizeof(limits)) or \
       not kernel.AssignProcessToJobObject(_memory_job,kernel.GetCurrentProcess()):
        raise OSError(ctypes.get_last_error(),"Cannot enforce 512 MiB atlas memory limit")
