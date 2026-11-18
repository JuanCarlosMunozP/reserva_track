"""Catálogo geográfico normalizado (3FN).

    Department 1──N City 1──N Branch 1──N Location N──1 Area
                                              │
                                              └──1──N spaces.Space (place)

- Una ciudad pertenece a un departamento (antes Location repetía ambos).
- Una sede (Branch) está en una ciudad.
- Una Location es un punto concreto dentro de una sede (área + detalle).
- Los espacios apuntan a una Location, así ninguna tabla queda aislada.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _


class Department(models.Model):
    name = models.CharField(_("Department"), max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class City(models.Model):
    name = models.CharField(_("City"), max_length=100)
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name="cities"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "cities"
        constraints = [
            models.UniqueConstraint(fields=("department", "name"), name="unique_city_per_department"),
        ]

    def __str__(self) -> str:
        return self.name


class Branch(models.Model):
    name = models.CharField(_("Branch"), max_length=100, unique=True)
    # Nullable para no romper el alta de sedes que hoy solo envía `name`.
    city = models.ForeignKey(
        City, on_delete=models.PROTECT, related_name="branches", null=True, blank=True
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "branches"

    def __str__(self) -> str:
        return self.name


class Area(models.Model):
    name = models.CharField(_("Area"), max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Location(models.Model):
    detail = models.CharField(_("Detail"), max_length=250)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="locations")
    area = models.ForeignKey(Area, on_delete=models.PROTECT, related_name="locations")

    class Meta:
        ordering = ["branch__name", "area__name", "detail"]
        constraints = [
            models.UniqueConstraint(fields=("branch", "area", "detail"), name="unique_location"),
        ]

    def __str__(self) -> str:
        return f"{self.branch} · {self.area} · {self.detail}"
