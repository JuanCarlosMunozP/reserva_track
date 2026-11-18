from rest_framework import serializers
from common.security import SanitizedSerializerMixin

from .models import Area, Branch, City, Department, Location


class BranchSerializer(SanitizedSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "city")
        read_only_fields = ("id",)

    def validate_name(self, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise serializers.ValidationError("El nombre de la sede es obligatorio.")
        queryset = Branch.objects.filter(name__iexact=name)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una sede con ese nombre.")
        return name

class _UniqueNameMixin:
    model = None

    def validate_name(self, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return name


class DepartmentSerializer(SanitizedSerializerMixin, _UniqueNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name")
        read_only_fields = ("id",)


class AreaSerializer(SanitizedSerializerMixin, _UniqueNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = ("id", "name")
        read_only_fields = ("id",)


class CitySerializer(SanitizedSerializerMixin, _UniqueNameMixin, serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = City
        fields = ("id", "name", "department", "department_name")
        read_only_fields = ("id",)


class LocationSerializer(SanitizedSerializerMixin, serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    area_name = serializers.CharField(source="area.name", read_only=True)
    label = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Location
        fields = ("id", "detail", "branch", "branch_name", "area", "area_name", "label")
        read_only_fields = ("id",)
