# syntax=docker/dockerfile:1.7

FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package \
    && mv target/pharmawms-backend-*.jar /src/app.jar

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S pharma && adduser -S -G pharma pharma
WORKDIR /app
COPY --from=build /src/app.jar ./app.jar
USER pharma
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=60s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8080/actuator/health | grep -q '"status":"UP"' || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
