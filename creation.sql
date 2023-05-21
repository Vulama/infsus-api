CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    password VARCHAR(50),
    username VARCHAR(50) UNIQUE,
    phone_number VARCHAR(20),
    email VARCHAR(50)
);

CREATE TABLE advert (
    id SERIAL PRIMARY KEY,
    ownerId INTEGER REFERENCES "user" (id),
    title VARCHAR(100),
    description TEXT,
    pictures TEXT[],
    address VARCHAR(100),
    city varchar(50),
    price_per_night DOUBLE PRECISION
);

CREATE TABLE reservation (
    id SERIAL PRIMARY KEY,
    userId INTEGER REFERENCES "user" (id),
    advertId INTEGER REFERENCES advert (id),
    startDate DATE,
    endDate DATE
);