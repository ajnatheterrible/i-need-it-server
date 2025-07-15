const createError = (msg, statusCode = 500) => {
  const err = new Error(msg);
  err.statusCode = statusCode;
  return err;
};

export default createError;
