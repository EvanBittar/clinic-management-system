function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {

    if (allowedRoles.includes(req.user.role)){
        next();
    }else{
        res.status(403).json({ message: 'Not Allow for this feature' });
    }
  };
}

module.exports = authorizeRoles;