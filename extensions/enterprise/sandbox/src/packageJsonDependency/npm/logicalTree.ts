// from https://raw.githubusercontent.com/npm/logical-tree/latest/index.js
'use strict'

import path from 'path'

interface Opts {
    version: string
    address?: string
    optional?: boolean
    dev?: boolean
    bundled?: boolean
    resolved: string
    integrity: boolean
}

class LogicalTree implements Opts {
    public name: string
    public version: string
    public address?: string
    public optional?: boolean
    public dev?: boolean
    public bundled?: boolean
    public resolved: string
    public integrity: boolean
    public dependencies: Map<string, any>
    public requiredBy: Set<any>

    constructor(name: string, address: string, opts: Opts) {
        this.name = name
        this.version = opts.version
        this.address = address || ''
        this.optional = !!opts.optional
        this.dev = !!opts.dev
        this.bundled = !!opts.bundled
        this.resolved = opts.resolved
        this.integrity = opts.integrity
        this.dependencies = new Map()
        this.requiredBy = new Set()
    }

    get isRoot() {
        return !this.requiredBy.size
    }

    addDep(dep) {
        this.dependencies.set(dep.name, dep)
        dep.requiredBy.add(this)
        return this
    }

    delDep(dep) {
        this.dependencies.delete(dep.name)
        dep.requiredBy.delete(this)
        return this
    }

    getDep(name) {
        return this.dependencies.get(name)
    }

    path(prefix) {
        if (this.isRoot) {
            // The address of the root is the prefix itself.
            return prefix || ''
        }
        return path.join(prefix || '', 'node_modules', this.address.replace(/:/g, '/node_modules/'))
    }

    // This finds cycles _from_ a given node: if some deeper dep has
    // its own cycle, but that cycle does not refer to this node,
    // it will return false.
    hasCycle(_seen, _from) {
        if (!_seen) {
            _seen = new Set()
        }
        if (!_from) {
            _from = this
        }
        for (const dep of this.dependencies.values()) {
            if (_seen.has(dep)) {
                continue
            }
            _seen.add(dep)
            if (dep === _from || dep.hasCycle(_seen, _from)) {
                return true
            }
        }
        return false
    }

    forEachAsync(fn, opts, _pending) {
        if (!opts) {
            opts = _pending || {}
        }
        if (!_pending) {
            _pending = new Map()
        }
        const P = opts.Promise || Promise
        if (_pending.has(this)) {
            return P.resolve(this.hasCycle() || _pending.get(this))
        }
        const pending = P.resolve().then(() =>
            fn(this, () => {
                return promiseMap(this.dependencies.values(), dep => dep.forEachAsync(fn, opts, _pending), opts)
            })
        )
        _pending.set(this, pending)
        return pending
    }

    forEach(fn, _seen) {
        if (!_seen) {
            _seen = new Set()
        }
        if (_seen.has(this)) {
            return
        }
        _seen.add(this)
        fn(this, () => {
            for (const dep of this.dependencies.values()) {
                dep.forEach(fn, _seen)
            }
        })
    }
}

export function lockTree(pkg, pkgLock) {
    const tree = makeNode(pkg.name, null, pkg)
    const allDeps = new Map()
    Array.from(
        new Set(
            Object.keys(pkg.devDependencies || {})
                .concat(Object.keys(pkg.optionalDependencies || {}))
                .concat(Object.keys(pkg.dependencies || {}))
        )
    ).forEach(name => {
        let dep = allDeps.get(name)
        if (!dep) {
            const depNode = (pkgLock.dependencies || {})[name]
            dep = makeNode(name, name, depNode)
        }
        addChild(dep, tree, allDeps, pkgLock)
    })
    return tree
}

function makeNode(name, address, opts) {
    return new LogicalTree(name, address, opts || {})
}

function addChild(dep, tree, allDeps, pkgLock) {
    tree.addDep(dep)
    allDeps.set(dep.address, dep)
    const addr = dep.address
    const lockNode = atAddr(pkgLock, addr)
    if (!lockNode) {
        // TODO!(sqs): this seems to happen for nested package-lock.json files
        //
        // console.log('NO LOCK NODE', { pkgLock, addr, dep })
        return
    }
    Object.keys(lockNode.requires || {}).forEach(name => {
        const tdepAddr = reqAddr(pkgLock, name, addr)
        let tdep = allDeps.get(tdepAddr)
        if (!tdep) {
            tdep = makeNode(name, tdepAddr, atAddr(pkgLock, tdepAddr))
            addChild(tdep, dep, allDeps, pkgLock)
        } else {
            dep.addDep(tdep)
        }
    })
}

function reqAddr(pkgLock, name, fromAddr) {
    const lockNode = atAddr(pkgLock, fromAddr)
    const child = (lockNode.dependencies || {})[name]
    if (child) {
        return `${fromAddr}:${name}`
    }
    const parts = fromAddr.split(':')
    while (parts.length) {
        parts.pop()
        const joined = parts.join(':')
        const parent = atAddr(pkgLock, joined)
        if (parent) {
            const child = (parent.dependencies || {})[name]
            if (child) {
                return `${joined}${parts.length ? ':' : ''}${name}`
            }
        }
    }
    const err = new Error(`${name} not accessible from ${fromAddr}`)
    err.pkgLock = pkgLock
    err.target = name
    err.from = fromAddr
    throw err
}

function atAddr(pkgLock, addr) {
    if (!addr.length) {
        return pkgLock
    }
    const parts = addr.split(':')
    return parts.reduce((acc, next) => acc && (acc.dependencies || {})[next], pkgLock)
}

function promiseMap(arr, fn, opts, _index) {
    _index = _index || 0
    const P = (opts && opts.Promise) || Promise
    if (P.map) {
        return P.map(arr, fn, opts)
    }
    if (!(arr instanceof Array)) {
        arr = Array.from(arr)
    }
    if (_index >= arr.length) {
        return P.resolve()
    } else {
        return P.resolve(fn(arr[_index], _index, arr)).then(() => promiseMap(arr, fn, opts, _index + 1))
    }
}
